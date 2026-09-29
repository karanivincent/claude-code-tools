// The journal lines behind the ledger's agent and wait numbers: `agent` lines (from the SubagentStop
// hook, or `delivery log-agent` after an agent returns) and `wait founder` / `wait slot` lines. They
// record; they never finish a step, so the phase clock skips them (lib/retro/record.mjs).

import { dirname, join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { agentFromTranscript, projectDirFor } from './usage.mjs';

const round = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

/** The journal event of one agent. Fields left undefined are left out, so a later line only fills in. */
export function agentEvent(a) {
  const counts = {};
  const put = (k, v) => { if (v !== undefined && v !== null && v !== '') counts[k] = v; };
  put('id', a.id);
  put('role', a.role);
  if (a.phase !== undefined) counts.phase = a.phase ?? 'none';
  put('model', a.model);
  if (a.effort !== undefined) counts.effort = a.effort ?? 'none';
  if (Number.isFinite(a.minutes)) counts.minutes = round(a.minutes);
  if (Number.isFinite(a.tokensIn)) counts.in = a.tokensIn;
  if (Number.isFinite(a.tokensCached)) counts.cached = a.tokensCached;
  if (Number.isFinite(a.tokensOut)) counts.out = a.tokensOut;
  if (Number.isFinite(a.costUsd)) counts.cost = round(a.costUsd, 2);
  put('outcome', a.outcome);
  return { command: 'agent', counts };
}

/** The event of a wait: kind "founder" or "slot". */
export function waitEvent(kind, minutes) {
  return { command: `wait ${kind}`, counts: { minutes: round(minutes) } };
}

/**
 * Where a subagent's transcript is, from a SubagentStop payload: agent_transcript_path when given,
 * else <session folder>/<session_id>/subagents/agent-<agent_id>.jsonl beside the main transcript,
 * else the same under Claude Code's folder for the payload's cwd. Null when none exists.
 */
export function transcriptOf(payload, env = process.env) {
  const id = payload.agent_id;
  const tries = [];
  if (payload.agent_transcript_path) tries.push(payload.agent_transcript_path);
  if (id && payload.session_id) {
    if (payload.transcript_path) tries.push(join(dirname(payload.transcript_path), payload.session_id, 'subagents', `agent-${id}.jsonl`));
    const proj = payload.cwd ? projectDirFor(payload.cwd, env) : null;
    if (proj) tries.push(join(proj, payload.session_id, 'subagents', `agent-${id}.jsonl`));
  }
  return tries.find((p) => existsSync(p)) ?? null;
}

/**
 * The agent a SubagentStop payload describes, read from its transcript: role, model, minutes,
 * tokens and cost; effort from models.json for its role. The payload's last message decides the
 * outcome when the transcript's does not. Null when there is no transcript to read.
 */
export function agentFromPayload(payload, env = process.env) {
  const file = transcriptOf(payload, env);
  if (!file) return null;
  let text, meta = {};
  try { text = readFileSync(file, 'utf8'); } catch { return null; }
  const metaFile = file.replace(/\.jsonl$/, '.meta.json');
  try { if (existsSync(metaFile)) meta = JSON.parse(readFileSync(metaFile, 'utf8')); } catch { meta = {}; }
  if (!meta.agentType && payload.agent_type) meta.agentType = payload.agent_type;
  const a = agentFromTranscript({ id: payload.agent_id ?? file, text, meta, effortFromConfig: true });
  if (!a) return null;
  const said = String(payload.last_assistant_message ?? '').match(/^\s*\**outcome\**:\s*\**([a-z][a-z-]*)/im);
  if (said) a.outcome = said[1].toLowerCase();
  return a;
}
