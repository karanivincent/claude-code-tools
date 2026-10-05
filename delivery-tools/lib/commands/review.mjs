// delivery review: compile a round's reviewer notes into review.json and the comparison page.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { defineCommand } from '../core/command.mjs';
import { intFlag, parseCommandArgs } from '../core/args.mjs';
import { EXIT, UsageError } from '../core/exit.mjs';
import { readMap } from '../picture/map.mjs';
import { listRounds, roundDir, roundInfo } from '../picture/rounds.mjs';
import { AUTO_MATCH_MAX_DIFF, MAX_BATCH_ITEMS, MAX_PARALLEL_REVIEWERS, SAMPLE_PER_SCREEN, batchPrompt, domFacts, batchWaves, heldToReview, noteOwners, parseReview, planReview, renderCompare, reshotItems, summarise } from '../picture/review.mjs';
import { exportShadow, runShadow, shadowFindings, shadowSetup, steerLines } from '../picture/shadow.mjs';
import { cropFor, designFileCandidates, hasPhone, mapItems, roundFiles } from '../picture/widths.mjs';
import { FACTS_DIR, factsFile, renderFacts } from '../picture/facts.mjs';
import { maskDom, maskTestids } from '../picture/shoot.mjs';
import { contractSummary, readContract } from '../picture/contract.mjs';
import { renderStuck, runDecision, stuckItems } from '../picture/stop.mjs';
import { fixtureForbiddenTables, forbiddenSteerLines } from '../seed/forbidden.mjs';
import { writeSteer } from '../retro/apply.mjs';

export default defineCommand({
  name: 'review',
  summary: 'Compile a round\'s reviewer notes into review.json and the comparison page',
  usage: `usage: delivery review --plan [--round <n>]
       delivery review [--round <n>] [--before <n>]
       delivery review --shadow-export

Picture mode. First "--plan": it works out what needs a reviewer and writes the batches, so the
main session only dispatches them. From round 2 on, an item whose live and design pictures are both
unchanged since the round before (their sha256, recorded by the shoot) keeps that round's label and
is not sent. An item whose text, test ids and buttons equal the design's, with pixels differing
in at most ${AUTO_MATCH_MAX_DIFF * 100}% of the picture, is marked a match without a reviewer; anything missing means it goes to
one. An item the round before passed (match or small) whose picture changed is sampled: per screen,
the ${SAMPLE_PER_SCREEN} that differ most from the design and any above the auto-match line go to a reviewer, and
the rest are held on their earlier label (review-plan.json "held"). When a sampled item comes back
to fix, "--plan --held" reviews the rest of its screen; every held item is reviewed once before
shipping, and ready stays red until then. When the stop rule stops the loop (no fall in the count
of items to fix for rounds.stallRounds rounds, or the ceiling), compiling writes stuck.md: each
stuck item with its notes per round, for the founder. The rest are packed into batches of up to ${MAX_BATCH_ITEMS} items (a state's desktop and phone together, a
screen kept whole where it fits) and written to the round's folder: review-plan.json (carried and
auto-matched items), batches.json (each batch, and the waves of at most ${MAX_PARALLEL_REVIEWERS} to dispatch
together) and batch-<n>.prompt.md, the exact prompt for each reviewer. If docs/delivery/<feature>/steers.md
exists, its text is added to every prompt. Before that, it gains one line per table the safety
file's probes say no fixture organisation may hold: values from it are data gaps. Each prompt also lists the data faults and must fixes
the shoot's datacheck already sorted by looking each traced value up in the world, and the values
the product does not store that the founder decided, so the reviewer does not write them again.
Dispatch each prompt file as it is, then run review without --plan.

After "shoot --only" re-shot some items into a round that was already planned, "--plan" plans only
those items: new batches numbered after the round's earlier ones, carried and auto-matched items
worked out again for them alone. When compiling, an item's notes come only from the latest batch
that was given it, so the notes on its earlier pictures drop out.

Without --plan, this command compiles the reviews. Reviewer agents (briefs/reviewer-picture.md) each write review-<group>.md into the
round's folder: one "## <ITEM>" section per item with a problem (an item is a state at a width:
"## KC-05" at desktop, "## KC-05@phone" at phone width), one bullet per problem, each starting
"must fix:", "small:", "design:" (the live page is right and the design is wrong, or missing
something the product has) or "data gap:" (the live page is only wrong because the seeded world
lacks what the state's map entry needs, checklist.md's "Needs data" line; A1). This command reads
them with the round's shoot.json and writes:

  review.json    every item's verdict: match, small, must, data-fault, data-gap, not-reached, back-to-design
                 or test-only, with notes; a page the shoot found scrolling sideways at phone width
                 is a must fix. An item with both a must-fix/small note and a design note keeps
                 its worse verdict; back-to-design is only for an item whose notes are all design:,
                 data-gap only for one whose notes are all data gap: (never a code defect, so it
                 never spends a fix round; reseed the world instead). data-fault is the same, found
                 by the shoot's datacheck before any reviewer: a traced value the world lacks. "delivery brief new <slug>
                 --from-run" turns design: notes into the next brief.
  compare.html   each state with a row per width: design, an earlier round and this round side by
                 side, with the notes; the pictures it shows are copied into the round's folder so
                 the folder publishes whole

An item with no section in any review matches. Only items the reviewers were given count: run it
after every group's reviewer has written its file.

options:
  --plan         write the reviewer batches instead of compiling (see above)
  --held         with --plan: review the items held back while their screen's sample was clean
                 (the screens whose sample found a problem, or all of them before shipping)
  --no-sample    with --plan: review every changed item, no sampling
  --round <n>    the round (default: the latest numbered round)
  --before <n>   the earlier round shown next to it (default: round 1, when this is a later round)

Shadow grader (optional). With profile review.shadowGrader { endpoint, model, keyEnv } and that
environment variable set, compiling a round also asks the outside model, for every must, small and
not-reached finding (carried items are skipped), whether it is a code bug, a data gap or a known
steer (the lines of steers.md), and writes rounds/<n>/shadow.json. It only records: review.json, the
counts, the exit code and what the builder sees are the same with or without it, and any failure is
one warning line. "--shadow-export" joins the run's shadow.json files into shadow-sample.json (the
findings, for blind labellers) and shadow-answers.json (the model's answers, kept apart).

exit: 0 compiled, nothing left to fix; 1 compiled, and items are still to fix or not reached;
      2 no round, no shoot.json or no review file

common options:
  --feature <slug>   the run (default: the single run in this worktree)
  --json             machine output: one JSON object on stdout
  --help             this text`,
  async run(ctx, argv) {
    const { values } = parseCommandArgs(argv, { options: { round: { type: 'string' }, before: { type: 'string' }, plan: { type: 'boolean' }, held: { type: 'boolean' }, 'no-sample': { type: 'boolean' }, 'shadow-export': { type: 'boolean' } } });
    const paths = ctx.requirePaths();
    if (values['shadow-export']) return shadowExport(ctx, paths);
    const rounds = listRounds(paths);
    const round = intFlag(values.round, '--round') ?? rounds[rounds.length - 1];
    if (!round) { ctx.out.fail('no-round', 'no numbered round yet; run delivery shoot first'); return EXIT.USAGE; }
    const info = roundInfo(paths, round);
    if (!info.shoot) { ctx.out.fail('no-shoot', `round ${round} has no shoot.json; run delivery shoot --round ${round}`); return EXIT.USAGE; }
    if (values.held && !values.plan) throw new UsageError('--held goes with --plan');
    if (values.plan) return planRound(ctx, paths, round, info, rounds, { held: Boolean(values.held), sample: !values['no-sample'] });
    if (!info.reviews.length && info.reviewPlan?.batches !== 0) { ctx.out.fail('no-review', `round ${round} has no review-*.md; run delivery review --plan --round ${round} and dispatch the batches (briefs/reviewer-picture.md)`); return EXIT.USAGE; }
    const map = readMap(paths);
    if (!map) { ctx.out.fail('no-map', 'there is no map.json'); return EXIT.USAGE; }

    const notes = {};
    const owners = noteOwners(readJson(join(info.dir, 'batches.json')), info.reviewPlan);
    for (const f of info.reviews) {
      for (const [id, n] of Object.entries(parseReview(readFileSync(join(info.dir, f), 'utf8'), mapItems(map).map((i) => i.key)))) {
        // A re-shot item's notes come only from the batch that reviewed its newest pictures.
        if (owners.has(id) && owners.get(id) !== f) continue;
        notes[id] ??= { must: [], small: [], design: [], dataGap: [] };
        notes[id].must.push(...n.must);
        notes[id].small.push(...n.small);
        notes[id].design.push(...n.design);
        notes[id].dataGap.push(...(n.dataGap ?? []));
      }
    }
    const summary = summarise({ map, shoot: info.shoot, notes, pre: info.reviewPlan ?? {} });

    const before = intFlag(values.before, '--before') ?? (round > 1 && rounds.includes(1) ? 1 : null);
    const beforeDir = before ? roundDir(paths, before) : null;
    if (beforeDir) mkdirSync(join(info.dir, 'before'), { recursive: true });
    const pictures = (key) => {
      const f = roundFiles(key);
      const design = existsSync(join(info.dir, f.design)) ? f.design : null;
      const now = existsSync(join(info.dir, f.live)) ? f.live : null;
      let prev = null;
      if (beforeDir && existsSync(join(beforeDir, f.live))) {
        copyFileSync(join(beforeDir, f.live), join(info.dir, 'before', f.live));
        prev = `before/${f.live}`;
      }
      return { design, before: prev, now };
    };
    const title = `${map.title ?? map.feature}: round ${round}`;
    await writeFile(join(info.dir, 'compare.html'), renderCompare({ title, round, beforeRound: before, map, summary, pictures }));
    const doc = { schemaVersion: 1, round, before, at: ctx.clock.now().toISOString(), counts: summary.counts, states: summary.states };
    await writeFile(join(info.dir, 'review.json'), JSON.stringify(doc, null, 1) + '\n');
    // W4: when the stop rule stops the loop, the founder gets only the stuck items.
    const decision = runDecision(paths);
    if (decision.decision === 'stop') {
      const stuck = stuckItems(paths);
      await writeFile(join(info.dir, 'stuck.md'), renderStuck(stuck, decision));
      ctx.out.line(`the loop stops: ${decision.why}; ${stuck.length} stuck item(s) for the founder in ${relative(ctx.repoRoot, join(info.dir, 'stuck.md'))}`);
    } else if (decision.decision === 'fix') ctx.out.line(`stop rule: another fix round (${decision.why})`);
    const heldNow = heldToReview(info.reviewPlan, doc);
    if (heldNow.failedScreens.length) ctx.out.line(`the sample found a problem in ${heldNow.failedScreens.join(', ')}: review --plan --round ${round} --held reviews the ${heldNow.keys.length} held item(s) there`);

    const c = summary.counts;
    const nCarried = Object.values(summary.states).filter((v) => v.carried).length;
    const nAuto = Object.values(summary.states).filter((v) => v.auto).length;
    const noun = hasPhone(map) ? ' (items: a state at a width)' : '';
    ctx.out.line(`round ${round}${noun}: ${c.match} match, ${c.small} small differences only, ${c.must} to fix, ${c.dataFault ?? 0} data fault, ${c.dataGap ?? 0} data gap, ${c.notReached} not reached, ${c.backToDesign} back to design, ${c.testOnly} unit tests only`);
    for (const [id, s] of Object.entries(summary.states)) {
      if (s.verdict === 'must') ctx.out.line(`  ${id}: ${s.must.length} to fix`);
      if (s.verdict === 'data-gap') ctx.out.line(`  ${id}: ${s.dataGap.length} data gap (reseed the world, not a code fix)`);
      if (s.verdict === 'data-fault') ctx.out.line(`  ${id}: ${s.dataFault.length} data fault (the world lacks a traced value; a seed-writer fixes it, not a code fix)`);
      if (s.verdict === 'not-reached') ctx.out.line(`  ${id}: not reached`);
      if (s.verdict === 'back-to-design') ctx.out.line(`  ${id}: back to design`);
    }
    if (nCarried || nAuto) ctx.out.line(`not sent to a reviewer: ${nCarried} carried from an earlier round, ${nAuto} matched automatically`);
    ctx.out.line(`comparison page: ${join(info.dir, 'compare.html')}`);
    ctx.out.set('review', { round, before, counts: c, carried: nCarried, auto: nAuto, compare: join(info.dir, 'compare.html') });
    const exit = c.must || c.notReached ? EXIT.RED : EXIT.PASS;
    await ctx.journal({ command: `review --round ${round}`, exit, counts: c });
    await shadowRound(ctx, paths, info, summary);
    return exit;
  },
});

/**
 * Record what the shadow grader would have answered. Runs after review.json is written and can
 * change nothing: every failure, including a bug here, is one warning line.
 */
async function shadowRound(ctx, paths, info, summary) {
  try {
    let profile = null;
    try { profile = await ctx.profile(); } catch { return; }
    const setup = shadowSetup(profile, ctx.env);
    if (setup.off === 'no-profile-key') return;
    if (setup.off === 'no-key') { ctx.out.warn(`shadow grader is off: ${setup.keyEnv} is not set`); return; }
    const findings = shadowFindings(summary, info.shoot);
    if (!findings.length) return;
    const steersFile = join(paths.deliveryDir, 'steers.md');
    const steers = existsSync(steersFile) ? steerLines(readFileSync(steersFile, 'utf8')) : [];
    const doc = await runShadow({ fetch: ctx.fetch, config: setup.config, key: setup.key, findings, steers, at: ctx.clock.now().toISOString(), sleep: ctx.sleep });
    await writeFile(join(info.dir, 'shadow.json'), JSON.stringify(doc, null, 1) + '\n');
    const failed = doc.answers.filter((a) => a.error);
    if (failed.length) ctx.out.warn(`shadow grader: ${failed.length} of ${doc.answers.length} answers failed (${failed[0].error})`);
  } catch (err) {
    ctx.out.warn(`shadow grader failed: ${String(err?.message ?? err).split('\n')[0]}`);
  }
}

/** review --shadow-export: the run's shadow answers, split into a sample and an answers file. */
async function shadowExport(ctx, paths) {
  const res = exportShadow(paths);
  if (!res) { ctx.out.fail('no-shadow', 'no round has a shadow.json; run delivery review with review.shadowGrader set in the profile'); return EXIT.USAGE; }
  const sample = join(paths.deliveryDir, 'shadow-sample.json');
  const answers = join(paths.deliveryDir, 'shadow-answers.json');
  mkdirSync(paths.deliveryDir, { recursive: true });
  await writeFile(sample, JSON.stringify(res.sample, null, 1) + '\n');
  await writeFile(answers, JSON.stringify(res.answers, null, 1) + '\n');
  ctx.out.line(`shadow: ${res.sample.items.length} finding(s) in ${relative(ctx.repoRoot, sample)}, answers apart in ${relative(ctx.repoRoot, answers)}${res.errors ? ` (${res.errors} failed request(s) left out)` : ''}`);
  ctx.out.set('shadowExport', { items: res.sample.items.length, errors: res.errors, sample, answers });
  return EXIT.PASS;
}

function readJson(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; }
}

/**
 * B7: one steer per table the safety file's probes say no fixture organisation may hold: its
 * values are test-data gaps, so reviewers mark them `data gap:`. writeSteer adds a line once.
 * No safety file: nothing to add.
 */
async function addForbiddenSteers(ctx, paths) {
  let tables = [];
  try { tables = fixtureForbiddenTables((await ctx.safety()).safety); } catch { return; }
  for (const line of forbiddenSteerLines(tables)) writeSteer(paths, line);
}

/** review --plan: carried and auto-matched items, then the reviewer batches with their prompts. */
async function planRound(ctx, paths, round, info, rounds, opts = {}) {
  const map = readMap(paths);
  if (!map) { ctx.out.fail('no-map', 'there is no map.json'); return EXIT.USAGE; }
  await addForbiddenSteers(ctx, paths);
  const earlier = rounds.filter((n) => n < round).pop();
  const prevInfo = earlier ? roundInfo(paths, earlier) : null;
  const prev = prevInfo?.shoot && prevInfo.review ? { round: earlier, shoot: prevInfo.shoot, review: prevInfo.review } : null;
  // R5: after shoot --only, plan just the re-shot items, next to the round's earlier batches.
  const oldBatches = readJson(join(info.dir, 'batches.json'));
  // W5: --held plans the items held back while their screen's sample was clean.
  const heldKeys = opts.held ? heldToReview(info.reviewPlan, info.review).keys : [];
  if (opts.held && !heldKeys.length) { ctx.out.line(`round ${round}: no held item to review`); return EXIT.PASS; }
  const reshot = opts.held ? heldKeys : oldBatches ? reshotItems(info.shoot, info.reviewPlan) : [];
  const partial = reshot.length > 0;
  const shoot = partial ? { ...info.shoot, states: Object.fromEntries(reshot.map((k) => [k, info.shoot.states[k]])) } : info.shoot;
  const plan = planReview({ map, shoot, prev: opts.held ? null : prev, sample: opts.sample === false || partial ? 0 : undefined });
  const offset = partial ? Math.max(0, ...(oldBatches.batches ?? []).map((b) => b.id)) : 0;
  if (!partial) for (const f of readdirSync(info.dir)) if (/^batch-\d+\.prompt\.md$/.test(f)) unlinkSync(join(info.dir, f));
  const steersFile = join(paths.deliveryDir, 'steers.md');
  const steersRel = relative(ctx.repoRoot, steersFile);
  const steers = existsSync(steersFile) ? readFileSync(steersFile, 'utf8') : null;
  const roundRel = relative(ctx.repoRoot, info.dir);
  const batches = [];
  // D6: values the product does not store, already decided by the founder, are not differences.
  let decidedNone = [];
  try { decidedNone = contractSummary(readContract(paths)).decided; } catch { decidedNone = []; }
  const planned = plan.batches.map((b) => ({ ...b, id: b.id + offset }));
  // W7: a short facts file per item the reviewers get, instead of reading shoot.json.
  mkdirSync(join(info.dir, FACTS_DIR), { recursive: true });
  for (const key of planned.flatMap((b) => b.items)) {
    const it = mapItems(map).find((i) => i.key === key);
    const rec = info.shoot.states?.[key];
    let designTexts = null;
    const file = it ? designFileCandidates(it.state, it.width).find((f) => existsSync(join(paths.designRenders, f))) : null;
    if (file) {
      const dom = readJson(join(paths.designRenders, file.replace(/\.png$/, '.dom.json')));
      designTexts = domFacts(maskDom(dom, maskTestids(it.state)), cropFor(map, it.width, it.id).designLeft ?? 0)?.text ?? null;
    }
    const liveFile = join(info.dir, `${key}.live.txt`);
    const liveTexts = existsSync(liveFile) ? readFileSync(liveFile, 'utf8').split('\n').filter(Boolean) : null;
    await writeFile(join(info.dir, factsFile(key)), renderFacts({ key, rec, designTexts, liveTexts }));
  }
  for (const b of planned) {
    const file = `review-batch-${b.id}.md`;
    const prompt = `batch-${b.id}.prompt.md`;
    const sorted = Object.fromEntries(b.items.map((k) => [k, info.shoot.states?.[k]?.lookup]).filter(([, v]) => v));
    const ids = new Set(b.items.map((k) => k.split('@')[0]));
    const decided = decidedNone.filter((d) => ids.has(d.state));
    await writeFile(join(info.dir, prompt), batchPrompt({ pluginRoot: ctx.pluginRoot, feature: paths.feature, worktree: ctx.repoRoot, roundRel, items: b.items, file, steers, steersRel, sorted, decided }));
    batches.push({ id: b.id, prompt, write: file, items: b.items, screens: b.screens });
  }
  const waves = batchWaves(planned);
  const allBatches = partial ? [...(oldBatches.batches ?? []), ...batches] : batches;
  const drop = (o) => Object.fromEntries(Object.entries(o ?? {}).filter(([k]) => !reshot.includes(k)));
  const carried = partial ? { ...drop(info.reviewPlan?.carried), ...plan.carried } : plan.carried;
  const auto = partial ? { ...drop(info.reviewPlan?.auto), ...plan.auto } : plan.auto;
  const held = partial ? drop(info.reviewPlan?.held) : plan.held;
  const sampled = partial ? (info.reviewPlan?.sampled ?? {}) : plan.sampled;
  await writeFile(join(info.dir, 'batches.json'), JSON.stringify({ schemaVersion: 1, round, maxItems: MAX_BATCH_ITEMS, maxParallel: MAX_PARALLEL_REVIEWERS, steers: steers ? steersRel : null, waves, batches: allBatches, ...(partial ? { reshot } : {}) }, null, 1) + '\n');
  await writeFile(join(info.dir, 'review-plan.json'), JSON.stringify({ schemaVersion: 1, round, at: ctx.clock.now().toISOString(), batches: allBatches.length, carried, auto, ...(Object.keys(held).length ? { held, sampled } : {}) }, null, 1) + '\n');
  const nc = Object.keys(plan.carried).length;
  const na = Object.keys(plan.auto).length;
  const nItems = batches.reduce((n, b) => n + b.items.length, 0);
  if (partial) ctx.out.line(`round ${round}: ${reshot.length} ${opts.held ? 'held' : 're-shot'} item(s) to review${opts.held ? '' : ' again'} (${reshot.join(', ')})`);
  if (!partial && Object.keys(plan.held).length) ctx.out.line(`round ${round}: ${Object.keys(plan.held).length} item(s) that passed last round changed picture and are held; ${Object.keys(plan.sampled).length} sampled per screen go to a reviewer (review --plan --held reviews the rest)`);
  ctx.out.line(`round ${round}: ${nc} carried from round ${earlier ?? '-'}, ${na} matched automatically, ${nItems} item(s) for a reviewer in ${batches.length} batch(es)`);
  waves.forEach((w, i) => ctx.out.line(`  dispatch together${waves.length > 1 ? ` (wave ${i + 1} of ${waves.length})` : ''}: ${w.map((id) => `batch-${id}.prompt.md`).join(', ')}`));
  if (!batches.length) ctx.out.line('  nothing to dispatch: run delivery review to compile');
  ctx.out.line(`batches: ${join(info.dir, 'batches.json')}${steers ? ` (steers from ${steersRel} added to every prompt)` : ''}`);
  ctx.out.set('reviewPlan', { round, carried: nc, auto: na, batches: batches.length, dir: info.dir });
  await ctx.journal({ command: `review --plan --round ${round}`, exit: EXIT.PASS, counts: { carried: nc, auto: na, batches: batches.length } });
  return EXIT.PASS;
}
