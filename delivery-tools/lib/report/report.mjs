// The founder's report (spec 11.5): the tldr format (TL;DR, Needs you with tiers, Went wrong,
// Done, depth linked), built only from ready.json, findings, the plan and the journal. No agent
// types it; the umbrella's final message is this text verbatim plus the punch-list link.
// Pure: buildReport takes the four sources (already read) and returns the lines.

// The warning sign is built from code points: its variation selector is invisible in source.
const WARNING = String.fromCodePoint(0x26a0, 0xfe0f);
const TIERS = ['🔴', '🟠', '🔵'];
const MAX_ITEMS = 5;

/**
 * @typedef {{ tier: '🔴'|'🟠'|'🔵', title: string, detail?: string, command?: string }} NeedsYou
 * @typedef {{
 *   ready: object|null, readyProblem?: string|null, stale?: string[],
 *   findings: { findings: object[] }|null, plan: object|null,
 *   state: { pr: number|null, epic: number|null, journal: { event: string }[] }|null, journalBroken?: string|null,
 *   head?: string|null, punchList?: string|null, cli: { version: string, manifestSha256: string|null },
 *   prUrl?: string|null,
 * }} ReportInput
 */

const short = (sha) => (sha ? `\`${String(sha).slice(0, 12)}\`` : '`unknown`');
const oneLine = (s, n = 110) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Facts the report reads from journal event lines ("cmd | exit=n | k=v"): re-audits (spec 8.2,
 * every one journalled), the auditors' spot-check disagreement (latest per group), failed commands.
 */
export function journalFacts(journal) {
  let reAudits = 0;
  const failed = new Map();
  const spot = new Map();
  for (const e of journal ?? []) {
    const [command, ...rest] = String(e.event).split(' | ');
    const kv = Object.fromEntries(rest.map((p) => { const i = p.indexOf('='); return i < 0 ? [p, ''] : [p.slice(0, i), p.slice(i + 1)]; }));
    if (/^re-?audit\b/i.test(command)) reAudits += Number(kv.reAudits ?? 1) || 1;
    if (command.startsWith('audit spot ')) spot.set(command.slice('audit spot '.length), { judged: Number(kv.judged) || 0, disagreed: Number(kv.disagreed) || 0 });
    if (kv.exit !== undefined && kv.exit !== '0' && kv.exit !== '') failed.set(command, (failed.get(command) ?? 0) + 1);
  }
  let judged = 0, disagreed = 0;
  for (const s of spot.values()) { judged += s.judged; disagreed += s.disagreed; }
  return { reAudits, failed, spot: judged ? { judged, disagreed } : null };
}

/**
 * @param {ReportInput} input
 * @returns {{ text: string, verdict: string, ready: boolean, needsYou: NeedsYou[], wentWrong: string[], done: string }}
 */
export function buildReport(input) {
  const ready = input.ready;
  const findings = input.findings?.findings ?? [];
  const plan = input.plan;
  const pr = input.state?.pr ?? null;
  const prRef = pr ? (input.prUrl ? `[#${pr}](${input.prUrl})` : `#${pr}`) : 'the PR';
  const stale = input.stale ?? [];
  const isReady = Boolean(ready && ready.ok && !stale.length && !input.readyProblem && !input.journalBroken);

  // TL;DR: the ready verdict for the head SHA first.
  let verdict;
  if (input.journalBroken) verdict = `Not ready: the run's journal is broken (${oneLine(input.journalBroken, 80)}), so nothing it recorded can be trusted.`;
  else if (input.readyProblem) verdict = `Not ready: ${input.readyProblem}.`;
  else if (!ready) verdict = `Not ready: no ready record${input.head ? ` for ${short(input.head)}` : ''}; \`delivery ready\` has not passed.`;
  else if (stale.length) verdict = `Not ready: the ready record for ${short(ready.headSha)} is stale (${stale.slice(0, 2).join('; ')}).`;
  else if (!ready.ok) {
    const red = ready.checks.filter((c) => !c.ok);
    verdict = `Not ready: ${red.length} of ${ready.checks.length} ready checks red on ${short(ready.headSha)} (${red.slice(0, 3).map((c) => c.id).join(', ')}${red.length > 3 ? ', …' : ''}).`;
  } else verdict = `Ready: ${prRef} at ${short(ready.headSha)} passed all ${ready.checks.length} ready checks.`;

  // Needs you: late changes, waivers and accepted P2s first (spec 11.5).
  const needs = [];
  if (input.journalBroken) needs.push({ tier: '🔴', title: 'Look at the broken journal before trusting any gate', detail: `${oneLine(input.journalBroken, 150)}\nEvery gate recomputes from sources, but the record of what ran is no longer reliable.` });
  for (const lc of ready?.lateChanges ?? []) needs.push({ tier: '🟠', title: `Check this late change before you merge: ${oneLine(lc, 90)}`, detail: 'It changed after the Scope issue was posted, so you have not seen it yet.' });
  for (const w of ready?.waivers ?? []) needs.push({ tier: '🟠', title: `Keep or lift the waiver before you merge: ${oneLine(w, 90)}` });
  const accepted = findings.filter((f) => f.status === 'accepted');
  if (accepted.length) {
    const first = accepted.slice(0, 2).map((f) => `${f.state}: ${oneLine(f.accept?.text ?? f.live, 70)} (${f.accept?.reasonClass ?? 'no reason'}, #${f.accept?.issue ?? '?'})`);
    needs.push({ tier: '🟠', title: `Read the ${plural(accepted.length, 'accepted difference')} before you merge`, detail: first.join('\n') });
  }
  if (isReady && pr) needs.push({ tier: '🔵', title: `Merge ${prRef} once the preview and the punch list look right`, detail: 'The merge is yours; land then proves it on staging and closes the epic.' });

  // Went wrong: what is still red, then what the journal shows failed.
  const wrong = [];
  if (ready && !ready.ok) for (const c of ready.checks.filter((x) => !x.ok)) wrong.push(`${c.id}: ${oneLine(c.detail || 'red', 100)}${c.evidence ? ` (${oneLine(c.evidence, 40)})` : ''}`);
  const openBy = (sev) => findings.filter((f) => f.status === 'open' && f.severity === sev);
  const p1 = openBy('P1'), p2 = openBy('P2');
  if (p1.length) wrong.push(`${plural(p1.length, 'P1 finding')} open, first ${p1[0].state} at ${oneLine(p1[0].where, 50)}: ${oneLine(p1[0].live || p1[0].design, 60)}`);
  if (p2.length) wrong.push(`${plural(p2.length, 'P2 finding')} open and not accepted`);
  if (ready && ready.counts.notReached) wrong.push(`${plural(ready.counts.notReached, 'state')} not reached by the last capture`);
  const facts = journalFacts(input.state?.journal);
  const reAudits = Math.max(ready?.counts?.reAudits ?? 0, facts.reAudits);
  if (reAudits) wrong.push(`${plural(reAudits, 're-audit')} of a screen group (each is journalled)`);
  for (const s of stale) if (!wrong.some((w) => w.includes(s))) wrong.push(`ready record stale: ${s}`);

  // Done: one compressed line.
  const c = ready?.counts;
  const parts = [];
  if (pr) parts.push(prRef);
  if (ready) parts.push(short(ready.headSha));
  if (c) {
    parts.push(`${c.statesBuilt} states built`);
    if (c.cut) parts.push(`${c.cut} cut`);
    if (c.adapted) parts.push(`${c.adapted} adapted`);
    if (c.invented) parts.push(`${c.invented} invented`);
    if (c.removed) parts.push(`${c.removed} removed`);
    if (c.propOrUnseedable) parts.push(`${c.propOrUnseedable} by component test`);
    if (c.p3Filed) parts.push(`${c.p3Filed} P3s filed`);
  } else if (plan) {
    const built = plan.rows.filter((r) => ['new', 'change', 'keep', 'migrate', 'adapt'].includes(r.class)).length;
    parts.push(`${built} rows planned`, `${plan.units.length} units`);
  }
  if (facts.spot) parts.push(`auditor spot check ${facts.spot.disagreed}/${facts.spot.judged} disagreed`);
  for (const o of ready?.owedAfterMerge ?? []) parts.push(`owed after merge: ${oneLine(o, 60)}`);
  parts.push(`delivery ${input.cli.version}${input.cli.manifestSha256 ? ` \`${input.cli.manifestSha256.slice(0, 12)}\`` : ' (no manifest)'}`);
  const done = parts.join(' · ');

  const lines = [];
  lines.push('## 📋 TL;DR');
  lines.push(verdict);
  const n = needs.length;
  const urgent = needs.some((x) => x.tier === '🔴');
  lines.push(n ? `${plural(n, 'thing')} ${n === 1 ? 'needs' : 'need'} you${urgent ? ', one or more urgent' : ''}.` : 'Nothing needs you.');
  lines.push('');
  const sorted = needs.map((x, i) => ({ ...x, i })).sort((a, b) => TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier) || a.i - b.i);
  let shown = sorted;
  if (sorted.length > MAX_ITEMS) {
    const rest = sorted.slice(MAX_ITEMS - 1);
    const worst = rest.map((x) => x.tier).sort((a, b) => TIERS.indexOf(a) - TIERS.indexOf(b))[0];
    shown = [...sorted.slice(0, MAX_ITEMS - 1), { tier: worst, title: `${rest.length} more items: see the punch list` }];
  }
  const header = shown.length ? shown.map((x) => x.tier).sort((a, b) => TIERS.indexOf(a) - TIERS.indexOf(b))[0] : '✅';
  lines.push(`## ${header} Needs you`);
  if (!shown.length) lines.push('Nothing.');
  for (const x of shown) {
    lines.push(`- ${x.tier} ${x.title}`);
    if (x.detail) {
      lines.push('');
      for (const d of x.detail.split('\n').slice(0, 2)) lines.push(`  ${d}`);
      lines.push('');
    }
  }
  if (wrong.length) {
    lines.push('');
    lines.push(`## ${WARNING} Went wrong`);
    const w = wrong.length > MAX_ITEMS ? [...wrong.slice(0, MAX_ITEMS - 1), `${wrong.length - (MAX_ITEMS - 1)} more: see the punch list`] : wrong;
    for (const x of w) lines.push(`- ${x}`);
  }
  lines.push('');
  lines.push('## ✅ Done');
  lines.push(`- ${done}`);
  if (input.punchList) {
    lines.push('');
    lines.push(`Full account: \`${input.punchList}\``);
  }
  const text = lines.join('\n').replace(/\n{3,}/g, '\n\n');
  return { text, verdict, ready: isReady, needsYou: shown, wentWrong: wrong, done };
}
