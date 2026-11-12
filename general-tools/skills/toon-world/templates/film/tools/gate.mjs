// The gate (toon-video "The order"): before the first critic round and before every render over 8 s, it runs the checks
// itself and refuses on any failure, with the whole list. Nobody edits this file, the thresholds in the scripts it runs,
// or approvals.json to get past it: a fault the owner accepts goes in STORY.acknowledged with its reason.
//   node src/stories/__SLUG__/tools/gate.mjs critic     before the first critic round
//   node src/stories/__SLUG__/tools/gate.mjs render     before a render over 8 s (render.mjs calls it)
// What it asks for, each with where it comes from:
//   files      stories/<slug>/meaning.md (the meaning sheet), stories/<slug>/parts.md (a "## <place>" section for every
//              place in places/index.ts: the blend's bands), out/<slug>/coldread.json (every place file read cold,
//              { "places": { "<place>": { "ok": true, "read": "..." } } })
//   approvals  src/stories/<slug>/approvals.json: the owner's click on the review page for "story" (script, voice and
//              meaning sheet) and "direction" (cast, look, parts plan, animatic), each
//              { "stage", "approved": true, "by": "page", "doc", "version", "at" } (decisions 3 and 11: an explicit
//              yes by button, read from the page's store; no agent writes it)
//   audit.mjs  the acting and camera audit, exit 0 (every issue fails unless acknowledged)
//   look.mjs   plain meshes, small textures, the detail layer, the flat share of every shot's still
//   levels.mjs the voice over the bed (floor 10 dB, ceiling 24 dB) and no dead air over 0.6 s, on the stems beside
//              STORY.audio (voice.wav and bed.wav)
//   measure_sharp.py and measure_look.py on look.mjs's stills (out/<slug>/look/stills.mp4), against STORY.reference
//              when set: sharpness, fine edges, saturation, brightness, luma and chroma inside their targets
//   the log    (rule S5-38) every critic report in out/<slug>/ (critic-<cycle>-<round>.md, critic-<cycle>-render.md) has
//              its critique row in docs/production-log.jsonl, matched by --file; every report but the newest was
//              followed by fixes, so it has a fix row with its --cycle and --round; every report from round 2 on, and
//              every render report, has its "## <cycle>-<round>" section in stories/<slug>/findings.md
// Times itself into out/<slug>/tool-times.jsonl (tool gate, step gate).
// Exit 0 open, 2 refused. Writes out/<slug>/gate-<stage>.json.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { toolTime } from './public.mjs';
// The measure scripts need numpy and scipy; macOS's system Python refuses pip installs (PEP 668), so they live in one
// shared venv: python3 -m venv ~/.cache/toon-tools/venv && ~/.cache/toon-tools/venv/bin/pip install numpy scipy
const VENV = path.join(process.env.HOME ?? '', '.cache/toon-tools/venv/bin/python');

const STAGES = { critic: 'before the first critic round', render: 'before a render over 8 s' };
const APPROVALS = { story: 'the story: script, voice and meaning sheet', direction: 'the direction: cast, look, parts plan and animatic' };

/** the places the film knows (places/index.ts keys) */
export function placesOf(storyDir) {
  const src = fs.readFileSync(path.join(storyDir, 'places/index.ts'), 'utf8');
  return [...src.matchAll(/^\s*['"]?([\w-]+)['"]?\s*:\s*\(\)\s*=>\s*import/gm)].map(m => m[1]);
}

/** the owner's approvals, as the review page's store writes them: an array of entries, or an object keyed by stage */
export function approvalOf(storyDir, stage) {
  const file = path.join(storyDir, 'approvals.json');
  if (!fs.existsSync(file)) return { ok: false, why: `no ${path.basename(storyDir)}/approvals.json` };
  let j;
  try { j = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return { ok: false, why: `approvals.json is not JSON: ${e.message}` }; }
  const list = Array.isArray(j) ? j : Array.isArray(j.entries) ? j.entries : Object.values(j);
  const e = list.filter(x => x && x.stage === stage).pop();
  if (!e) return { ok: false, why: `no "${stage}" approval (${APPROVALS[stage] ?? 'the parts plan of ' + stage.replace(/^parts-/, '')}): the owner clicks Approve on the review page` };
  // the review page template writes { stage, story, approved, at, note, by: <viewer id>, source: "page" }; the lead copies
  // the row from the page's store unchanged (ArtifactData list approvals), never writes one (rule S0-13)
  const miss = [e.approved !== true && 'approved: true', e.source !== 'page' && 'source: "page"', !e.at && 'at', !e.by && 'by'].filter(Boolean);
  return miss.length ? { ok: false, why: `the "${stage}" approval lacks ${miss.join(', ')}` } : { ok: true, why: `${stage}: approved at ${new Date(e.at).toISOString()}` };
}

/** the files the order requires before the stage */
export function filesOf(root, slug, places) {
  const out = [], st = path.join(root, 'stories', slug);
  const nonEmpty = f => fs.existsSync(f) && fs.readFileSync(f, 'utf8').replace(/<!--[\s\S]*?-->/g, '').trim().length > 40;
  const rows = f => fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(l => /^\|/.test(l) && !/^\|[\s|:-]+\|?$/.test(l)).length - 1 : -1;
  if (!nonEmpty(path.join(st, 'meaning.md')) || rows(path.join(st, 'meaning.md')) < 1) out.push(`stories/${slug}/meaning.md: missing or no rows (the meaning sheet: a row a line, what it means and must show)`);
  const parts = path.join(st, 'parts.md');
  if (!fs.existsSync(parts)) out.push(`stories/${slug}/parts.md: missing (the parts plan: the blend's bands for every place)`);
  else {
    const p = fs.readFileSync(parts, 'utf8');
    for (const pl of places.filter(x => x !== 'example')) if (!new RegExp(`^##\\s+${pl}\\b`, 'm').test(p)) out.push(`stories/${slug}/parts.md: no "## ${pl}" section`);
    if (/TODO|<fill/i.test(p)) out.push(`stories/${slug}/parts.md: still has template placeholders (TODO or <fill ...>)`);
  }
  const cold = path.join(root, 'out', slug, 'coldread.json');
  if (!fs.existsSync(cold)) out.push(`out/${slug}/coldread.json: missing (every place file read cold by an agent with no context)`);
  else {
    let j = {};
    try { j = JSON.parse(fs.readFileSync(cold, 'utf8')); } catch (e) { out.push(`out/${slug}/coldread.json: not JSON (${e.message})`); }
    if (!j.places) out.push(`out/${slug}/coldread.json: no "places" object`);
    else for (const pl of places) if (j.places[pl]?.ok !== true) out.push(`out/${slug}/coldread.json: ${pl} ${j.places[pl] ? 'read wrong: ' + (j.places[pl].read ?? '') : 'not read'}`);
  }
  if (places.includes('example')) out.push('places/index.ts still lists the template\'s example place: build the story\'s own places');
  // every owner note pulled from the review page (src/stories/<slug>/notes.json, the notes collection unchanged) is
  // closed in lessons.md as story-only or with the rule id it became (rule S6-15)
  const notesF = path.join(root, 'src', 'stories', slug, 'notes.json');
  if (fs.existsSync(notesF)) {
    let notes = [];
    try { const j = JSON.parse(fs.readFileSync(notesF, 'utf8')); notes = Array.isArray(j) ? j : Object.entries(j).map(([id, v]) => ({ id, ...v })); } catch (e) { out.push(`notes.json: not JSON (${e.message})`); }
    const lessonsF = path.join(st, 'lessons.md'), lessons = fs.existsSync(lessonsF) ? fs.readFileSync(lessonsF, 'utf8') : '';
    for (const n of notes) if (n.id && !lessons.includes(n.id)) out.push(`stories/${slug}/lessons.md: owner note ${n.id} is not closed (write "${n.id}: story-only" or "${n.id}: <rule id>")`);
  }
  return out;
}

/** the production log's script, from the newest toon-video in the plugin cache (rule S6-10) */
function logScript() {
  const cache = path.join(process.env.HOME ?? '', '.claude/plugins/cache/vince-tools-marketplace/general-tools');
  const num = v => v.split('.').map(n => n.padStart(6, '0')).join('.');
  try {
    const v = fs.readdirSync(cache).filter(d => /^\d+\.\d+\.\d+$/.test(d)).sort((a, b) => num(a) < num(b) ? -1 : 1).pop();
    const f = v && path.join(cache, v, 'skills/toon-video/scripts/production_log.py');
    if (f && fs.existsSync(f)) return f;
  } catch { /* no cache here */ }
  return '<toon-video>/scripts/production_log.py';
}

/** the critic reports in out/<slug>/, in the order they were made: by cycle, then round, the render report last */
export function reportsOf(root, slug) {
  const dir = path.join(root, 'out', slug);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).map(f => f.match(/^critic-(\d+)-(\d+|render)\.md$/)).filter(Boolean)
    .map(m => ({ file: m[0], cycle: Number(m[1]), round: m[2] === 'render' ? 'render' : Number(m[2]) }))
    .sort((a, b) => a.cycle - b.cycle || (a.round === 'render' ? 1e9 : a.round) - (b.round === 'render' ? 1e9 : b.round));
}

/** the logging the cycle asks for (rule S5-38: S6-10, S5-11, S5-12, S5-27): a critique row for every critic report, a
 *  fix row for every report that was fixed, a findings section for every report from round 2 on and every render */
export function loggingOf(root, slug) {
  const out = [], reports = reportsOf(root, slug);
  if (!reports.length) return out;
  const logF = path.join(root, 'docs', 'production-log.jsonl'), py = logScript();
  let rows = [];
  if (!fs.existsSync(logF)) out.push(`docs/production-log.jsonl: missing; every step is logged there with ${py} add (S6-10)`);
  else fs.readFileSync(logF, 'utf8').split('\n').forEach((l, i) => {
    if (!l.trim()) return;
    try { rows.push(JSON.parse(l)); } catch { out.push(`docs/production-log.jsonl: line ${i + 1} is not JSON`); }
  });
  rows = rows.filter(r => r.story === slug);
  const add = `python3 ${py} add docs/production-log.jsonl --story ${slug}`;
  const logged = new Set(rows.filter(r => r.stage === 'critique' && r.file).map(r => path.basename(r.file)));
  // a row logged before --file and --cycle existed: name it, so the fields go onto it rather than a second row
  const isRender = x => (x.mode ?? (/\brender\b/i.test(`${x.step ?? ''} ${x.note ?? ''}`) ? 'render' : 'stills')) === 'render';
  const unfiled = (r, stage) => rows.find(x => x.stage === stage && !x.file && (x.cycle == null || x.cycle === r.cycle) &&
    (stage === 'fix' ? x.cycle == null && String(x.round) === String(r.round) : r.round === 'render' ? isRender(x) : !isRender(x) && x.round === r.round));
  for (const r of reports) if (!logged.has(r.file)) {
    const mode = r.round === 'render' ? 'render' : 'stills', old = unfiled(r, 'critique');
    if (old) { out.push(`docs/production-log.jsonl: the critique row logged ${old.at} ("${old.step}") names no report: add "cycle": ${r.cycle}, "round": ${JSON.stringify(r.round)}, "mode": "${mode}", "file": "${r.file}" to that line`); continue; }
    out.push(`docs/production-log.jsonl: no critique row for out/${slug}/${r.file}. Log it: ${add} --stage critique --cycle ${r.cycle} --round ${r.round} --mode ${mode} --file ${r.file} --step "cycle ${r.cycle} ${mode === 'render' ? 'render critic' : 'critic round ' + r.round}" --score <average> --areas world=..,camera=..,people=..,light=..,story=..,sound=..${mode === 'render' ? ',motion=..' : ''} --judge <critic model> --minutes <m> --tokens <t>`);
  }
  // every report but the newest was followed by a fix round
  for (const r of reports.slice(0, -1)) {
    if (rows.some(x => x.stage === 'fix' && x.cycle === r.cycle && String(x.round) === String(r.round))) continue;
    const old = unfiled(r, 'fix');
    if (old) { out.push(`docs/production-log.jsonl: the fix row logged ${old.at} ("${old.step}") for round ${r.round} has no cycle: add "cycle": ${r.cycle} to that line`); continue; }
    out.push(`docs/production-log.jsonl: ${r.file} was fixed, but no fix row has cycle ${r.cycle} round ${r.round}. Log it: ${add} --stage fix --cycle ${r.cycle} --round ${r.round} --step "<what the round fixed>" --by <builders> --minutes <m> --tokens <t> --note "<production_log.py tooltime out/${slug}/tool-times.jsonl --since <round start>: its note line>"`);
  }
  // the findings, from round 2 on and on every render (S5-11, S5-27)
  const fF = path.join(root, 'stories', slug, 'findings.md'), findings = fs.existsSync(fF) ? fs.readFileSync(fF, 'utf8') : null;
  const format = 'each predicted gain against the result, then each finding as fault, what allowed it, the change and its level: impossible, easy, rule with a picture, check (S5-11, S5-27)';
  const need = reports.filter(r => r.round === 'render' || r.round >= 2);
  if (need.length && findings === null) out.push(`stories/${slug}/findings.md: missing. Write a "## <cycle>-<round>" section (## 1-2, ## 1-render) for every critic report from round 2 on and every render report: ${format}`);
  else for (const r of need) {
    const key = `${r.cycle}-${r.round}`, m = findings.match(new RegExp(`^##\\s+${key}[ \\t]*$([\\s\\S]*?)(?=^##\\s|(?![\\s\\S]))`, 'm'));
    const body = m ? m[1].replace(/<!--[\s\S]*?-->/g, '').trim() : '';
    if (!m) out.push(`stories/${slug}/findings.md: no "## ${key}" section for ${r.file}. Write it: ${format}`);
    else if (body.length < 40) out.push(`stories/${slug}/findings.md: "## ${key}" is empty. Fill it: ${format}`);
  }
  return out;
}

const run = (cmd, args, cwd) => {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', maxBuffer: 1 << 28, env: { ...process.env } });
  return { code: r.status ?? (r.error ? 127 : 1), out: `${r.stdout ?? ''}${r.stderr ?? ''}${r.error ? r.error.message : ''}` };
};
const tail = (s, n = 12) => s.trim().split('\n').filter(l => /SHORT|BURIED|DEAD|MISS|FLAT|^\d+\.\d+-|could not|error|failed|missing|No module|pip install/i.test(l)).slice(0, n).map(l => '      ' + l.trim());

/** runs every check for the stage; returns { ok, refusals } and writes out/<slug>/gate-<stage>.json */
export function gate(storyDir, stage, opts = {}) {
  if (!STAGES[stage]) throw new Error(`gate: stage must be ${Object.keys(STAGES).join(' or ')}, not "${stage}"`);
  storyDir = path.resolve(storyDir);
  const slug = path.basename(storyDir), root = path.resolve(storyDir, '../../..'), tools = path.join(storyDir, 'tools');
  const refusals = [], log = m => opts.quiet || console.log(m), t0 = Date.now();
  const places = placesOf(storyDir);
  refusals.push(...filesOf(root, slug, places));
  refusals.push(...loggingOf(root, slug));
  for (const st of Object.keys(APPROVALS)) { const a = approvalOf(storyDir, st); if (!a.ok) refusals.push(`approval: ${a.why}`); }
  // each place's parts plan has its own Approve button (rule S2-10): stage "parts-<place>"
  for (const pl of places.filter(x => x !== 'example')) { const a = approvalOf(storyDir, `parts-${pl}`); if (!a.ok) refusals.push(`approval: ${a.why}`); }
  const conc = String(opts.concurrency ?? 4);
  log(`gate ${stage}: running the audit`);
  const au = run(process.execPath, [path.join(tools, 'audit.mjs'), conc], root);
  if (au.code !== 0) refusals.push(`audit.mjs: ${au.code === 1 ? 'open issues (out/' + slug + '/audit.txt)' : 'could not run'}`, ...tail(au.out));
  log(`gate ${stage}: running the look checks`);
  const lk = run(process.execPath, [path.join(tools, 'look.mjs'), conc], root);
  if (lk.code !== 0) refusals.push(`look.mjs: ${lk.code === 1 ? 'open issues (out/' + slug + '/look.txt)' : 'could not run'}`, ...tail(lk.out));
  // the story's sound settings, as the audit read them from STORY
  let story = {};
  try { story = JSON.parse(fs.readFileSync(path.join(root, 'out', slug, 'audit.json'), 'utf8')).story ?? {}; } catch { refusals.push('audit.json: missing, so the sound stems and the reference are unknown'); }
  if (story.audio) {
    const dir = path.join(root, 'public', path.dirname(story.audio)), voice = path.join(dir, 'voice.wav'), bed = path.join(dir, 'bed.wav');
    if (!fs.existsSync(voice) || !fs.existsSync(bed)) refusals.push(`levels: no voice.wav and bed.wav beside ${story.audio} (the sound script writes both stems)`);
    else {
      const pauses = (story.pauses ?? []).flatMap(([a, b]) => ['--pause', `${a}-${b}`]);
      const lv = run(process.execPath, [path.join(tools, 'levels.mjs'), voice, bed, path.join(storyDir, 'full.json'), ...pauses], root);
      if (lv.code !== 0) refusals.push(`levels.mjs: ${lv.code === 3 ? 'the mix fails' : 'could not run'}`, ...tail(lv.out));
    }
  }
  const stills = path.join(root, 'out', slug, 'look', 'stills.mp4'), py = process.env.TOON_PYTHON ?? (fs.existsSync(VENV) ? VENV : 'python3');
  if (!fs.existsSync(stills)) refusals.push(`measure: no out/${slug}/look/stills.mp4 (look.mjs makes it)`);
  else {
    const ref = story.reference ? [path.join(root, story.reference)] : [];
    // a measured miss the owner has seen and accepts passes as STORY.acknowledged { check: 'measure-<name>', reason }
    // (the name as the MISS line gives it: measure-sharpness, measure-saturation ...); any other miss refuses
    const acks = new Map((story.acknowledged ?? []).filter(a => /^measure-/.test(a.check) && a.reason?.trim()).map(a => [a.check, a.reason]));
    const measure = (script, out, code) => {
      if (code === 0) return;
      if (code !== 1) { refusals.push(`${script}: could not run`, ...tail(out)); return; }
      const misses = out.split('\n').filter(l => /^\s*MISS /.test(l)), open = misses.filter(l => !acks.has('measure-' + l.trim().split(/\s+/)[1]));
      for (const l of misses.filter(x => !open.includes(x))) log(`gate ${stage}: passed (owner accepts: ${acks.get('measure-' + l.trim().split(/\s+/)[1])}): ${l.trim()}`);
      if (open.length || !misses.length) refusals.push(`${script}: outside the targets`, ...(open.length ? open.map(l => '      ' + l.trim()) : tail(out)));
    };
    const sh = run(py, [path.join(tools, 'measure_sharp.py'), stills, ...ref], root);
    measure('measure_sharp.py', sh.out, sh.code);
    const lo = run(py, [path.join(tools, 'measure_look.py'), stills], root);
    measure('measure_look.py', lo.out, lo.code);
  }
  const result = { stage, at: new Date().toISOString(), ok: !refusals.length, refusals };
  fs.mkdirSync(path.join(root, 'out', slug), { recursive: true });
  fs.writeFileSync(path.join(root, 'out', slug, `gate-${stage}.json`), JSON.stringify(result, null, 1));
  toolTime(root, 'gate', 'gate', t0);
  if (refusals.length) {
    console.error(`gate ${stage} (${STAGES[stage]}): refused, ${refusals.filter(r => !r.startsWith(' ')).length} reason(s):`);
    for (const r of refusals) console.error(r.startsWith(' ') ? r : `  - ${r}`);
    console.error('Fix them and run the gate again. A fault the owner has seen and accepts goes in STORY.acknowledged with its reason.');
  } else log(`gate ${stage}: open`);
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [stage, conc] = process.argv.slice(2);
  if (!STAGES[stage]) { console.error('usage: node gate.mjs critic|render [concurrency]'); process.exit(1); }
  process.exit(gate(path.resolve(import.meta.dirname, '..'), stage, { concurrency: conc }).ok ? 0 : 2);
}
