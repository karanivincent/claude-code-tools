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
// Exit 0 open, 2 refused. Writes out/<slug>/gate-<stage>.json.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
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
  const refusals = [], log = m => opts.quiet || console.log(m);
  const places = placesOf(storyDir);
  refusals.push(...filesOf(root, slug, places));
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
