// delivery review (picture mode): read the reviewers' notes for a round, count what matches the
// design, and render the comparison page (design, first round, this round, and the notes). All of
// it works on items, a state at a width: "KC-05" at desktop, "KC-05@phone" at phone width.
// parseReview and summarise are pure; renderCompare returns HTML; backToDesignItems reads a run's
// rounds on disk.

import { listRounds, roundInfo } from './rounds.mjs';
import { tunable } from '../retro/tunables.mjs';
import { mapItems, normaliseItemKey } from './widths.mjs';

const NOTE_KINDS = ['must fix', 'small', 'design', 'data gap'];

/**
 * One reviewer file to notes per item. An item section is "## <ID>" or "## <ID>@phone" (anything
 * after the key is ignored, and "<ID>@desktop" is read as "<ID>"); each bullet starts with
 * "must fix:", "small:", "design:" (the live page is right and the design is wrong or missing
 * something the product has) or "data gap:" (the live page is only wrong because the seeded world
 * lacks what the state's map entry (state.data) needs — checklist.md prints that need under the
 * state; A1). A bullet's wrapped lines are joined.
 * @param {string} md
 * @param {string[]|null} [ids] the map's item keys; other headings end a section
 * @returns {Record<string, { must: string[], small: string[], design: string[], dataGap: string[] }>}
 */
export function parseReview(md, ids = null) {
  const out = {};
  const known = ids ? new Set(ids) : null;
  let cur = null;
  let last = null;
  // must fix/small/data gap can lead with or without a colon ("must fix:", "`must fix`"); design
  // cannot — "design" is an ordinary word that starts plenty of real notes ("Design shows a large
  // button ...; the live page has none (must fix)"), so only a literal "design:" (colon required)
  // counts as its lead. An explicit must-fix/small/data-gap marker, leading or trailing, is checked
  // first and wins.
  const leadRe = /^`?\*{0,2}(must fix|small|data gap)\*{0,2}`?\s*[:\-—]?\s*/i;
  const designLeadRe = /^`?\*{0,2}design\*{0,2}`?\s*:\s*/i;
  // "design" (unlike "must fix"/"small"/"data gap") is an ordinary word that legitimately ends a
  // sentence ("...doesn't match the design."), so it is never stripped as a trailing marker, only
  // a leading one.
  const trailRe = /\s*`?\(?(must fix|small|data gap)\)?`?\.?$/i;
  const kindKey = (label) => {
    const l = label.toLowerCase();
    return l === 'must fix' ? 'must' : l === 'data gap' ? 'dataGap' : l;
  };
  for (const raw of String(md).split('\n')) {
    const line = raw.replace(/\s+$/, '');
    const head = /^##\s+([A-Za-z0-9][A-Za-z0-9._-]*(?:@[A-Za-z]+)?)\b/.exec(line);
    const key = head ? normaliseItemKey(head[1]) : null;
    // An item heading names an item key: one of the map's, or at least an id with a digit in it.
    if (head && (known ? known.has(key) : /\d/.test(key))) { cur = key; out[cur] ??= { must: [], small: [], design: [], dataGap: [] }; last = null; continue; }
    if (/^#{1,2}\s/.test(line)) { cur = null; last = null; continue; }
    if (!cur) continue;
    const bullet = /^\s{0,3}[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      const text = bullet[1].trim();
      const lead = leadRe.exec(text);
      const trail = !lead ? trailRe.exec(text) : null;
      const designLead = !lead && !trail ? designLeadRe.exec(text) : null;
      const kind = lead ? kindKey(lead[1]) : trail ? kindKey(trail[1]) : designLead ? 'design' : (/\bmust fix\b/i.test(text) ? 'must' : 'small');
      const stripped = lead ? text.replace(leadRe, '') : designLead ? text.replace(designLeadRe, '') : text;
      const clean = stripped.replace(trailRe, '').trim();
      out[cur][kind].push(clean);
      last = { kind, i: out[cur][kind].length - 1 };
      continue;
    }
    if (last && line.trim() && /^\s/.test(raw)) {
      const arr = out[cur][last.kind];
      arr[last.i] = `${arr[last.i]} ${line.trim()}`.replace(trailRe, '').trim();
    } else if (!line.trim()) {
      last = null;
    }
  }
  return out;
}

/**
 * Per-item verdicts for a round, keyed by item key. The shoot's own sideways-scroll finding at phone
 * width is a must-fix note on its item, whether or not a reviewer also wrote it. An item whose only
 * bullets are `design:` gets `back-to-design`; an item that also has a must-fix or small note keeps
 * that worse verdict, but its design notes are still recorded (backToDesignItems reads them from
 * every item, not only ones verdicted `back-to-design`). An item whose notes are `data gap:` only
 * (the seeded world lacks what state.data needs, A1) gets `data-gap`, not `must`: it is not a code
 * defect for the builder, so it never spends one of the picture loop's fix rounds (lib/run/ready.mjs
 * pictureReadiness treats it separately, and always keeps ready red until the world is re-seeded).
 * A data-gap note alongside a real must-fix note still leaves the verdict `must` (the code defect
 * is the worse problem), but the data-gap note is kept either way.
 * An item `pre.carried` names (its pictures did not change since an earlier round, A6) takes that
 * round's label and notes and is marked `carried: { from }`; one in `pre.auto` (text, test ids,
 * buttons and pixels all agree with the design) is a match marked `auto: true`. Neither went to a
 * reviewer, and both only apply to an item the shoot reached.
 * @param {{ map: object, shoot: object|null, notes: Record<string, {must: string[], small: string[], design?: string[], dataGap?: string[]}>, pre?: { carried?: Record<string, {from: number, state: object}>, auto?: Record<string, object> } }} input
 */
export function summarise({ map, shoot, notes, pre = {} }) {
  const states = {};
  const counts = { match: 0, small: 0, must: 0, notReached: 0, testOnly: 0, backToDesign: 0 };
  for (const { key, state: s } of mapItems(map)) {
    const given = notes[key] ?? { must: [], small: [], design: [], dataGap: [] };
    const shot = shoot?.states?.[key];
    const n = { must: [...given.must], small: [...given.small], design: [...(given.design ?? [])], dataGap: [...(given.dataGap ?? [])] };
    const carried = shot?.reached && !s.reach?.test ? pre.carried?.[key] : null;
    if (carried) {
      const c = carried.state;
      n.must = [...(c.must ?? [])]; n.small = [...(c.small ?? [])]; n.design = [...(c.design ?? [])]; n.dataGap = [...(c.dataGap ?? [])];
    } else if (shot?.reached && shot.overflow > 0 && !n.must.some((t) => /sideways|horizontal(ly)? scroll/i.test(t))) {
      n.must.push(`the page scrolls sideways by ${shot.overflow} px (found by the shoot)`);
    }
    let verdict;
    if (s.reach?.test) verdict = 'test-only';
    else if (!shot) verdict = 'not-shot';
    else if (!shot.reached) verdict = 'not-reached';
    else if (n.must.length) verdict = 'must';
    else if (n.dataGap.length) verdict = 'data-gap';
    else if (n.small.length) verdict = 'small';
    else if (n.design.length) verdict = 'back-to-design';
    else verdict = 'match';
    const bucket = { 'test-only': 'testOnly', 'not-reached': 'notReached', 'not-shot': 'notReached', 'back-to-design': 'backToDesign', 'data-gap': 'dataGap' }[verdict] ?? verdict;
    counts[bucket] = (counts[bucket] ?? 0) + 1;
    const auto = !carried && verdict === 'match' && pre.auto?.[key];
    states[key] = {
      verdict, must: n.must, small: n.small, design: n.design, ...(n.dataGap.length ? { dataGap: n.dataGap } : {}),
      ...(carried ? { carried: { from: carried.from } } : {}), ...(auto ? { auto: true } : {}),
    };
  }
  return { states, counts };
}

/**
 * The `design:` items from the last round that has a compiled review.json, whether or not that
 * item's overall verdict is `back-to-design` (a must/small item's design notes count too). One
 * entry per `design:` bullet.
 * @param {{ runDir: string }} paths
 * @returns {{ id: string, note: string }[]}
 */
export function backToDesignItems(paths) {
  let review = null;
  for (const n of listRounds(paths)) {
    const info = roundInfo(paths, n);
    if (info.review) review = info.review;
  }
  if (!review) return [];
  const out = [];
  for (const [id, s] of Object.entries(review.states ?? {})) {
    for (const note of s.design ?? []) out.push({ id, note });
  }
  return out;
}

const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const inline = (t) => esc(t).replace(/`([^`]+)`/g, '<code>$1</code>');

/**
 * The comparison page: one card per state, and inside it one row per width the state is checked at,
 * each with three pictures (design, first round, this round) and the reviewers' notes for that item.
 * A desktop-only state has a single row, laid out as before widths existed. Picture paths are
 * relative to the page.
 * @param {{ title: string, round: number, beforeRound: number|null, map: object, summary: ReturnType<typeof summarise>, pictures: (key: string) => { design: string|null, before: string|null, now: string|null } }} o
 */
export function renderCompare(o) {
  const { counts } = o.summary;
  const label = { match: 'matches', small: 'small differences', must: 'to fix', 'test-only': 'unit tests only', 'not-reached': 'not reached', 'not-shot': 'not pictured', 'back-to-design': 'back to design', 'data-gap': 'data gap' };
  const widthLabel = { desktop: 'Desktop', phone: 'Phone' };
  const screens = [...new Set((o.map.states ?? []).map((s) => s.screen))];
  const items = mapItems(o.map);
  const multi = items.some((i) => i.width !== 'desktop');
  const fig = (src, cap, id) => (src
    ? `<figure class="shot"><figcaption>${cap}</figcaption><button type="button" class="zoom" data-src="${esc(src)}" data-cap="${esc(id)} · ${cap}"><img loading="lazy" src="${esc(src)}" alt="${esc(id)} ${cap}"></button></figure>`
    : `<figure class="shot"><figcaption>${cap}</figcaption><div class="empty">No picture</div></figure>`);
  const pillText = (v) => {
    if (v.carried) return `${label[v.verdict]} (carried)`;
    if (v.verdict === 'must') return `${v.must.length} to fix`;
    if (v.verdict === 'back-to-design') return `${v.design.length} back to design`;
    if (v.verdict === 'data-gap') return `${v.dataGap.length} data gap`;
    if (v.auto) return 'matches (auto)';
    return label[v.verdict];
  };
  const rank = ['must', 'not-reached', 'not-shot', 'data-gap', 'small', 'back-to-design', 'test-only', 'match'];
  const rows = (o.map.states ?? []).map((s) => {
    const mine = items.filter((i) => i.id === s.id);
    const verdicts = mine.map((i) => o.summary.states[i.key]).filter(Boolean);
    const worst = verdicts.map((v) => v.verdict).sort((a, b) => rank.indexOf(a) - rank.indexOf(b))[0] ?? 'not-shot';
    const widthRow = (it) => {
      const v = o.summary.states[it.key] ?? { verdict: 'not-shot', must: [], small: [], design: [], dataGap: [] };
      const p = o.pictures(it.key);
      const notes = [...v.must.map((t) => `<li class="m">${inline(t)}</li>`), ...(v.dataGap ?? []).map((t) => `<li class="g">${inline(t)}</li>`), ...v.small.map((t) => `<li class="s">${inline(t)}</li>`), ...(v.design ?? []).map((t) => `<li class="d">${inline(t)}</li>`)].join('');
      const trio = `<div class="trio">${fig(p.design, 'Design', it.key)}${o.beforeRound ? fig(p.before, `Round ${o.beforeRound}`, it.key) : ''}${fig(p.now, `Round ${o.round}`, it.key)}</div>`;
      const list = notes ? `<ul class="notes">${notes}</ul>` : '';
      const note = v.carried ? `<p class="carried">Carried from round ${esc(v.carried.from)}: neither picture changed, so it was not reviewed again.</p>` : v.auto ? '<p class="carried">Matched without a reviewer: the text, test ids, buttons and pixels agree with the design.</p>' : '';
      if (!multi) return { pill: `<span class="pill ${v.verdict}">${esc(pillText(v))}</span>`, body: `${note}${trio}\n  ${list}` };
      const name = widthLabel[it.width] ?? it.width;
      return {
        pill: `<span class="pill ${v.verdict}">${esc(name)}: ${esc(pillText(v))}</span>`,
        body: `<section class="width ${esc(it.width)}" aria-label="${esc(name)}"><h3>${esc(name)}</h3>${note}${trio}${list}</section>`,
      };
    };
    const parts = mine.map(widthRow);
    return `<article class="state" data-screen="${esc(s.screen)}" data-verdict="${worst}" id="${esc(s.id)}">
  <header><span class="sid">${esc(s.id)}</span><h2>${esc(s.screen)} / ${esc(s.name)}</h2>${parts.map((x) => x.pill).join('')}</header>
  ${parts.map((x) => x.body).join('\n  ')}
</article>`;
  }).join('\n');
  const chips = screens.map((sc) => `<button type="button" class="chip" data-screen="${esc(sc)}" aria-pressed="false">${esc(sc)}</button>`).join('');
  return `<title>${esc(o.title)}</title>
<style>
:root { --ground:#f3f4f6; --panel:#fff; --ink:#16181d; --muted:#5d6470; --line:#dde0e6; --accent:#e8590c;
  --must:#c92a2a; --must-bg:#fff0f0; --small:#9a6700; --small-bg:#fff8e1; --ok:#2b8a3e; --ok-bg:#ebfbee; --none-bg:#eceef2;
  --sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; --mono: ui-monospace, Menlo, monospace; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { color-scheme: dark; --ground:#121418; --panel:#1b1e24; --ink:#e8eaee; --muted:#9aa1ad; --line:#2c313a;
  --accent:#ff8a3d; --must:#ff8787; --must-bg:#3a1d1f; --small:#f2c14e; --small-bg:#33290f; --ok:#69db7c; --ok-bg:#173022; --none-bg:#23272f; } }
:root[data-theme="dark"] { color-scheme: dark; --ground:#121418; --panel:#1b1e24; --ink:#e8eaee; --muted:#9aa1ad; --line:#2c313a;
  --accent:#ff8a3d; --must:#ff8787; --must-bg:#3a1d1f; --small:#f2c14e; --small-bg:#33290f; --ok:#69db7c; --ok-bg:#173022; --none-bg:#23272f; }
body { background:var(--ground); color:var(--ink); font:400 15px/1.5 var(--sans); padding-inline:16px; padding-block:24px 64px; margin:0; }
.wrap { max-width:1500px; margin:0 auto; display:grid; gap:20px; }
h1 { font-size:1.6rem; font-weight:600; margin:0; text-wrap:balance; }
.lede { margin:6px 0 0; color:var(--muted); max-width:70ch; }
.tally { display:flex; flex-wrap:wrap; gap:8px; margin:14px 0 0; padding:0; list-style:none; }
.tally li { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:6px 12px; font-variant-numeric:tabular-nums; }
.tally b { margin-right:4px; }
.bar { position:sticky; top:env(safe-area-inset-top,0px); z-index:2; background:var(--ground); padding-block:10px; display:flex; flex-wrap:wrap; gap:8px; }
.chip { font:500 .85rem/1 var(--sans); color:var(--ink); background:var(--panel); border:1px solid var(--line); border-radius:999px; padding:8px 14px; cursor:pointer; }
.chip[aria-pressed="true"] { background:var(--ink); color:var(--panel); border-color:var(--ink); }
.chip:focus-visible, .zoom:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
.state { background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:16px; display:grid; gap:12px; }
.state header { display:flex; flex-wrap:wrap; align-items:baseline; gap:10px; }
.sid { font:500 .8rem/1 var(--mono); color:var(--muted); }
.state h2 { font-size:1.05rem; font-weight:600; margin:0; flex:1 1 20rem; }
.pill { font-size:.78rem; font-weight:600; border-radius:999px; padding:3px 10px; color:var(--muted); background:var(--none-bg); }
.pill.must, .pill.not-reached { color:var(--must); background:var(--must-bg); } .pill.small { color:var(--small); background:var(--small-bg); } .pill.match { color:var(--ok); background:var(--ok-bg); } .pill.back-to-design, .pill.data-gap { color:var(--accent); background:var(--none-bg); }
.trio { display:grid; grid-template-columns:repeat(auto-fit, minmax(min(100%, 280px), 1fr)); gap:12px; }
.shot { margin:0; display:grid; gap:6px; align-content:start; }
.shot figcaption { font-size:.78rem; font-weight:500; color:var(--muted); letter-spacing:.03em; text-transform:uppercase; }
.zoom { all:unset; cursor:zoom-in; display:block; border:1px solid var(--line); border-radius:6px; overflow:hidden; background:#fff; max-height:560px; }
.zoom img { display:block; width:100%; height:auto; }
.empty { display:grid; place-items:center; min-height:120px; color:var(--muted); background:var(--none-bg); border-radius:6px; font-size:.85rem; }
.width { display:grid; gap:10px; border-top:1px solid var(--line); padding-top:12px; }
.width h3 { font-size:.85rem; font-weight:600; margin:0; color:var(--muted); letter-spacing:.03em; text-transform:uppercase; }
.width.phone .trio { grid-template-columns:repeat(auto-fit, minmax(min(100%, 200px), 390px)); }
.notes { margin:0; padding-left:1.2rem; display:grid; gap:4px; max-width:110ch; }
.notes li.m::marker { color:var(--must); } .notes li.s { color:var(--muted); } .notes li.d::marker { color:var(--accent); } .notes li.g::marker { color:var(--accent); }
.carried { margin:0; color:var(--muted); font-size:.85rem; }
.notes code { font:500 .85em var(--mono); }
.viewer { position:fixed; inset:0; z-index:10; background:rgba(8,10,14,.9); overflow:auto; padding:calc(56px + env(safe-area-inset-top,0px)) 16px 24px; }
.viewer img { display:block; margin:0 auto; max-width:min(100%,1200px); background:#fff; border-radius:4px; }
.vbar { position:fixed; top:0; left:0; right:0; display:flex; justify-content:space-between; align-items:center; gap:12px; padding:calc(10px + env(safe-area-inset-top,0px)) 16px 10px; background:rgba(8,10,14,.95); color:#fff; }
.vbar button { font:500 .85rem/1 var(--sans); color:#fff; background:transparent; border:1px solid #777; border-radius:999px; padding:7px 14px; cursor:pointer; }
</style>
<div class="wrap">
  <section>
    <h1>${esc(o.title)}</h1>
    <p class="lede">Each designed state${multi ? ', at each width it is checked at' : ''}: the design, ${o.beforeRound ? `round ${o.beforeRound}, ` : ''}and round ${o.round}, with the reviewers' notes. Only the page's own area is pictured. Click a picture to see it full size.</p>
    <ul class="tally"><li><b>${counts.match}</b>match</li><li><b>${counts.small}</b>small differences only</li><li><b>${counts.must}</b>to fix</li>${counts.dataGap ? `<li><b>${counts.dataGap}</b>data gap</li>` : ''}<li><b>${counts.notReached}</b>not reached</li><li><b>${counts.backToDesign}</b>back to design</li><li><b>${counts.testOnly}</b>unit tests only</li></ul>
  </section>
  <nav class="bar" aria-label="Filter states">${chips}<button type="button" class="chip" data-verdict="must" aria-pressed="false">To fix</button></nav>
  <main class="wrap">${rows}</main>
</div>
<div class="viewer" id="viewer" hidden role="dialog" aria-modal="true" aria-label="Full-size picture">
  <div class="vbar"><span id="vcap"></span><button type="button" id="vclose">Close</button></div>
  <img id="vimg" alt="">
</div>
<script>
(function () {
  var screen = null, onlyMust = false;
  function apply() { document.querySelectorAll('.state').forEach(function (a) {
    a.hidden = (screen && a.dataset.screen !== screen) || (onlyMust && a.dataset.verdict !== 'must'); }); }
  document.querySelectorAll('.chip[data-screen]').forEach(function (c) { c.addEventListener('click', function () {
    screen = screen === c.dataset.screen ? null : c.dataset.screen;
    document.querySelectorAll('.chip[data-screen]').forEach(function (x) { x.setAttribute('aria-pressed', String(x.dataset.screen === screen)); });
    apply(); }); });
  var mc = document.querySelector('.chip[data-verdict]');
  mc.addEventListener('click', function () { onlyMust = !onlyMust; mc.setAttribute('aria-pressed', String(onlyMust)); apply(); });
  var v = document.getElementById('viewer'), vi = document.getElementById('vimg'), vc = document.getElementById('vcap');
  function close() { v.hidden = true; document.body.style.overflow = ''; }
  document.querySelectorAll('.zoom').forEach(function (b) { b.addEventListener('click', function () {
    vi.src = b.dataset.src; vi.alt = b.dataset.cap; vc.textContent = b.dataset.cap; v.hidden = false; v.scrollTop = 0; document.body.style.overflow = 'hidden'; }); });
  document.getElementById('vclose').addEventListener('click', close);
  v.addEventListener('click', function (e) { if (e.target === v) close(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !v.hidden) close(); });
})();
</script>
`;
}

// ---- Review only what changed, and batch it (A6) ----

/** The share of pixels that may differ (by more than PIXEL_TOLERANCE in any channel) for an item to skip its reviewer. */
export const AUTO_MATCH_MAX_DIFF = tunable('review.autoMatchMaxDiff');
/** How far one colour channel may differ before a pixel counts as different (anti-aliasing noise). */
export const PIXEL_TOLERANCE = tunable('review.pixelTolerance');
export const MAX_BATCH_ITEMS = tunable('review.maxBatchItems');
export const MAX_PARALLEL_REVIEWERS = tunable('review.maxParallelReviewers');

/**
 * What a picture's dom.json says, cut to the page area (elements at or right of `left`): the
 * visible text, the visible test ids and the names of the controls, each sorted and de-duplicated.
 * Read the same way from a live capture and a design render, so the two can be compared exactly.
 * @param {{ elements?: object[] }|null} dom
 * @param {number} [left]
 * @returns {{ text: string[], testids: string[], buttons: string[] }|null}
 */
export function domFacts(dom, left = 0) {
  if (!dom || !Array.isArray(dom.elements)) return null;
  const inArea = dom.elements.filter((e) => e.visible !== false && (e.box?.x ?? 0) >= left - 8);
  const uniq = (xs) => [...new Set(xs.filter(Boolean).map((t) => String(t).replace(/\s+/g, ' ').trim()).filter(Boolean))].sort();
  return {
    text: uniq(inArea.filter((e) => e.kind === 'text').map((e) => e.text)),
    testids: uniq(inArea.map((e) => e.testid)),
    buttons: uniq(inArea.filter((e) => e.kind === 'control').map((e) => e.name)),
  };
}

/**
 * Whether two facts agree exactly. Missing data on either side, or no text at all, is "no": a
 * false match is never reviewed again, so every doubt sends the item to a reviewer.
 */
export function factsAgree(a, b) {
  if (!a || !b || !a.text?.length || !b.text?.length) return false;
  return ['text', 'testids', 'buttons'].every((k) => JSON.stringify(a[k] ?? null) === JSON.stringify(b[k] ?? null));
}

/**
 * Whether the shoot's own record for an item lets it skip a reviewer: reached, nothing found
 * wrong by the shoot (buttons as the map says, no sideways scroll), the extracted text, test ids
 * and buttons agree with the design's, and the pixel difference is measured and within
 * `threshold`. A pixel difference that could not be measured (sizes differ, no diff function) is
 * "no".
 * @param {object|undefined} rec an item's record in shoot.json
 * @param {number} [threshold]
 */
export function canAutoMatch(rec, threshold = AUTO_MATCH_MAX_DIFF) {
  if (!rec?.reached || rec.problems?.length || rec.overflow) return false;
  if ((rec.buttons ?? []).some((b) => b.onPage !== (b.shouldBe === 'shown'))) return false;
  return rec.factsAgree === true && typeof rec.pixelDiff === 'number' && Number.isFinite(rec.pixelDiff) && rec.pixelDiff >= 0 && rec.pixelDiff <= threshold;
}

/**
 * Which items keep an earlier round's label: both pictures hashed and unchanged since that round,
 * and that round gave the item a label a picture can carry (not "not reached").
 * @returns {Record<string, { from: number, state: object }>}
 */
export function carriedItems({ keys, shoot, prevShoot, prevReview, prevRound }) {
  const out = {};
  if (!shoot || !prevShoot || !prevReview) return out;
  for (const key of keys) {
    const now = shoot.states?.[key];
    const was = prevShoot.states?.[key];
    const label = prevReview.states?.[key];
    if (!now?.reached || !was?.reached || !label) continue;
    if (!now.liveHash || !now.designHash || now.liveHash !== was.liveHash || now.designHash !== was.designHash) continue;
    if (['not-reached', 'not-shot', 'test-only'].includes(label.verdict)) continue;
    out[key] = { from: label.carried?.from ?? prevRound, state: label };
  }
  return out;
}

/**
 * Pack units (one state's items at every width, kept together) into batches of at most `cap`
 * items. Units are taken screen by screen; a screen that fits stays in one batch (a new batch is
 * started rather than split it), and a screen larger than a batch is split between units.
 * @param {{ screen: string, items: string[] }[]} units
 * @returns {{ items: string[], screens: string[] }[]}
 */
export function packBatches(units, cap = MAX_BATCH_ITEMS) {
  const screens = [];
  for (const u of units) {
    let g = screens.find((x) => x.screen === u.screen);
    if (!g) { g = { screen: u.screen, units: [] }; screens.push(g); }
    g.units.push(u);
  }
  const batches = [];
  let cur = null;
  const size = (us) => us.reduce((n, u) => n + u.items.length, 0);
  const push = (u) => {
    if (!cur || cur.items.length + u.items.length > cap) { cur = { items: [], screens: [] }; batches.push(cur); }
    cur.items.push(...u.items);
    if (!cur.screens.includes(u.screen)) cur.screens.push(u.screen);
  };
  for (const g of screens) {
    if (cur && cur.items.length + size(g.units) > cap && size(g.units) <= cap) cur = null;
    for (const u of g.units) push(u);
  }
  return batches;
}

/**
 * The plan for a round's review: which items keep an earlier label, which match without a
 * reviewer, and the batches of the rest.
 * @param {{ map: object, shoot: object, prev?: { round: number, shoot: object|null, review: object|null }|null, threshold?: number, cap?: number }} o
 */
export function planReview({ map, shoot, prev = null, threshold = AUTO_MATCH_MAX_DIFF, cap = MAX_BATCH_ITEMS }) {
  const items = mapItems(map);
  const keys = items.filter((i) => !i.state.reach?.test && shoot.states?.[i.key]?.reached).map((i) => i.key);
  const carried = carriedItems({ keys, shoot, prevShoot: prev?.shoot, prevReview: prev?.review, prevRound: prev?.round });
  const auto = {};
  for (const key of keys) {
    if (!carried[key] && canAutoMatch(shoot.states[key], threshold)) auto[key] = { pixelDiff: shoot.states[key].pixelDiff };
  }
  const units = [];
  for (const s of map.states ?? []) {
    const mine = items.filter((i) => i.id === s.id && keys.includes(i.key) && !carried[i.key] && !auto[i.key]).map((i) => i.key);
    if (mine.length) units.push({ screen: s.screen, items: mine });
  }
  const batches = packBatches(units, cap).map((b, i) => ({ id: i + 1, ...b }));
  return { carried, auto, batches };
}

/** The batches in the order they are dispatched: waves of at most MAX_PARALLEL_REVIEWERS. */
export function batchWaves(batches, parallel = MAX_PARALLEL_REVIEWERS) {
  const waves = [];
  for (let i = 0; i < batches.length; i += parallel) waves.push(batches.slice(i, i + parallel).map((b) => b.id));
  return waves;
}

/**
 * One reviewer's prompt: the fixed dispatch lines, then the run's steers (steers.md), if any.
 * @param {{ pluginRoot: string, feature: string, worktree: string, roundRel: string, items: string[], file: string, steers?: string|null, steersRel?: string }} o
 */
export function batchPrompt(o) {
  const lines = [
    `Read ${o.pluginRoot}/briefs/reviewer-picture.md and follow it.`,
    `Feature: ${o.feature}   Worktree: ${o.worktree}`,
    `Round: ${o.roundRel}/   States: ${o.items.join(' ')}   Write: ${o.file}`,
  ];
  const steers = (o.steers ?? '').trim();
  return lines.join('\n') + (steers ? `\n\nSteers for this run (from ${o.steersRel ?? 'steers.md'}):\n${steers}` : '') + '\n';
}
