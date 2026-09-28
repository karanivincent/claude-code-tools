// The shadow grader: while a round is compiled, ask an outside decision model what it would have
// answered for every finding, and write the answers next to the round. Record only. Nothing here
// changes a verdict, a count, an exit code or what a builder sees; delivery review calls it after
// review.json is written and swallows every failure into one warning line. The endpoint, the model
// and the NAME of the key's environment variable come from the profile (review.shadowGrader); the
// key itself is read from the environment, sent in one header and never written anywhere.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseItemKey } from './widths.mjs';
import { listRounds, roundsDir } from './rounds.mjs';

export const MAX_CONCURRENT = 8;
export const TIMEOUT_MS = 30000;
export const MAX_TRIES = 3;

/** The three-way question. The wording is the one that was measured; do not reword it casually. */
export const QUESTION = Object.freeze({
  criteria: {
    'code-bug': 'The built page is wrong compared with the design, and its code must change.',
    'data-gap': 'The page is built right, but the seeded test data lacks what the design shows (missing rows, unseeded people, different fixture names or counts).',
    'known-steer': "The finding is one of this run's known steers: a difference the team already accepted or told reviewers to ignore.",
  },
  rules: [
    'Choose known-steer only when the finding matches one of the listed known steers.',
    'Choose data-gap only when the difference is in the data shown, not in layout, wording, controls or behaviour.',
  ],
});

/** The lines of steers.md, one known steer each; an empty list when there is no file. */
export function steerLines(text) {
  return String(text ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
}

/**
 * Every finding of a compiled round that a reviewer wrote or the shoot found: each must and small
 * sentence and each not-reached reason. Carried items (A6) are skipped; so are design and data gap
 * notes. Pure.
 * @returns {{ state: string, width: string, verdict: string, text: string }[]}
 */
export function shadowFindings(summary, shoot) {
  const out = [];
  for (const [key, s] of Object.entries(summary?.states ?? {})) {
    if (s.carried) continue;
    const { id, width } = parseItemKey(key);
    const add = (verdict, texts) => { for (const text of texts) if (text) out.push({ state: id, width, verdict, text }); };
    if (s.verdict === 'not-reached') add('not-reached', shoot?.states?.[key]?.problems ?? []);
    add('must', s.must ?? []);
    add('small', s.small ?? []);
  }
  return out;
}

/** The request body for one finding. */
export function shadowRequest({ model, finding, steers }) {
  return {
    model,
    state: { finding: finding.text, reviewerVerdict: finding.verdict, knownSteers: steers },
    questions: { answer: { type: 'choice', criteria: QUESTION.criteria, instructions: { rules: QUESTION.rules } } },
  };
}

const redact = (text, key) => (key ? String(text).split(key).join('***') : String(text));

/**
 * Ask about one finding: up to MAX_TRIES tries, and only a thrown network error (or timeout) is
 * tried again. Never throws; a failure comes back as { error } with the key blanked out.
 */
async function askOne({ fetch, config, key, finding, steers, sleep, timeoutMs }) {
  const body = JSON.stringify(shadowRequest({ model: config.model, finding, steers }));
  let last = 'no answer';
  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    let res;
    try {
      res = await fetch(config.endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      last = `network: ${e?.message ?? e}`;
      if (attempt < MAX_TRIES) await sleep(1000 * attempt);
      continue;
    }
    try {
      if (!res.ok) return { error: `http ${res.status}` };
      const ans = (await res.json())?.answers?.answer;
      if (!ans || !Object.hasOwn(QUESTION.criteria, ans.choice)) return { error: 'no usable choice' };
      return { choice: ans.choice, probs: ans.probabilities ?? {} };
    } catch (e) {
      return { error: redact(`bad answer: ${e?.message ?? e}`, key) };
    }
  }
  return { error: redact(last, key) };
}

/**
 * Ask about every finding, at most MAX_CONCURRENT requests at once. Returns the shadow.json
 * document; per-finding failures are inside it as `error`.
 * @param {{ fetch: typeof fetch, config: { endpoint: string, model: string }, key: string, findings: object[], steers: string[], at: string,
 *           sleep?: (ms: number) => Promise<void>, timeoutMs?: number }} o
 */
export async function runShadow(o) {
  const sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const timeoutMs = o.timeoutMs ?? TIMEOUT_MS;
  const answers = new Array(o.findings.length);
  let next = 0;
  const worker = async () => {
    while (next < o.findings.length) {
      const i = next++;
      const f = o.findings[i];
      const r = await askOne({ fetch: o.fetch, config: o.config, key: o.key, finding: f, steers: o.steers, sleep, timeoutMs });
      answers[i] = { state: f.state, width: f.width, verdict: f.verdict, text: f.text, ...r };
    }
  };
  await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT, o.findings.length) }, worker));
  return { schemaVersion: 1, model: o.config.model, at: o.at, answers };
}

/**
 * The shadow grader's settings and key for this run, or a reason it is off.
 * @returns {{ config: object, key: string }|{ off: 'no-profile-key'|'no-key' }}
 */
export function shadowSetup(profile, env) {
  const config = profile?.review?.shadowGrader;
  if (!config?.endpoint || !config.model || !config.keyEnv) return { off: 'no-profile-key' };
  const key = String(env?.[config.keyEnv] ?? '').trim();
  if (!key) return { off: 'no-key', keyEnv: config.keyEnv };
  return { config, key };
}

/**
 * Join every round's shadow.json into a sample (no answers) and an answers file, so labellers can
 * be handed the sample alone. Findings whose request failed have nothing to score and are left out.
 * @param {{ runDir: string, feature: string }} paths
 * @returns {{ sample: object, answers: object, errors: number }|null} null when no round has a shadow.json
 */
export function exportShadow(paths) {
  const items = [];
  const answers = {};
  const models = new Set();
  let errors = 0;
  let found = false;
  for (const round of listRounds(paths)) {
    const file = join(roundsDir(paths), String(round), 'shadow.json');
    if (!existsSync(file)) continue;
    let doc;
    try { doc = JSON.parse(readFileSync(file, 'utf8')); } catch { continue; }
    found = true;
    if (doc.model) models.add(doc.model);
    for (const a of doc.answers ?? []) {
      if (a.error) { errors += 1; continue; }
      const id = `f${String(items.length + 1).padStart(3, '0')}`;
      items.push({ id, round, state: a.state, width: a.width, verdict: a.verdict, text: a.text });
      answers[id] = { choice: a.choice, probs: a.probs };
    }
  }
  if (!found) return null;
  return {
    sample: { schemaVersion: 1, feature: paths.feature, items },
    answers: { schemaVersion: 1, feature: paths.feature, models: [...models], answers },
    errors,
  };
}
