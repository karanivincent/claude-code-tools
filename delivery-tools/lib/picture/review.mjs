// delivery review (picture mode): read the reviewers' notes for a round, count what matches the
// design, and render the comparison page (design, first round, this round, and the notes).
// parseReview and summarise are pure; renderCompare returns HTML.

/**
 * One reviewer file to notes per state. A state section is "## <ID>" (anything after the id is
 * ignored); each bullet starts with "must fix:" or "small:". A bullet's wrapped lines are joined.
 * @param {string} md
 * @param {string[]|null} [ids] the map's state ids; other headings end a section
 * @returns {Record<string, { must: string[], small: string[] }>}
 */
export function parseReview(md, ids = null) {
  const out = {};
  const known = ids ? new Set(ids) : null;
  let cur = null;
  let last = null;
  for (const raw of String(md).split('\n')) {
    const line = raw.replace(/\s+$/, '');
    const head = /^##\s+([A-Za-z0-9][A-Za-z0-9._-]*)\b/.exec(line);
    // A state heading names a state id: one of the map's, or at least an id with a digit in it.
    if (head && (known ? known.has(head[1]) : /\d/.test(head[1]))) { cur = head[1]; out[cur] ??= { must: [], small: [] }; last = null; continue; }
    if (/^#{1,2}\s/.test(line)) { cur = null; last = null; continue; }
    if (!cur) continue;
    const bullet = /^\s{0,3}[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      const text = bullet[1].trim();
      const kind = /^`?\*{0,2}must fix/i.test(text) || /\bmust fix\b/i.test(text) ? 'must' : 'small';
      const clean = text.replace(/^`?\*{0,2}(must fix|small)\*{0,2}`?\s*[:\-—]?\s*/i, '').replace(/\s*`?\(?(must fix|small)\)?`?\.?$/i, '').trim();
      out[cur][kind].push(clean);
      last = { kind, i: out[cur][kind].length - 1 };
      continue;
    }
    if (last && line.trim() && /^\s/.test(raw)) {
      const arr = out[cur][last.kind];
      arr[last.i] = `${arr[last.i]} ${line.trim()}`.replace(/\s*`?\(?(must fix|small)\)?`?\.?$/i, '').trim();
    } else if (!line.trim()) {
      last = null;
    }
  }
  return out;
}

/**
 * Per-state verdicts for a round.
 * @param {{ map: object, shoot: object|null, notes: Record<string, {must: string[], small: string[]}> }} input
 */
export function summarise({ map, shoot, notes }) {
  const states = {};
  const counts = { match: 0, small: 0, must: 0, notReached: 0, testOnly: 0 };
  for (const s of map.states ?? []) {
    const n = notes[s.id] ?? { must: [], small: [] };
    const shot = shoot?.states?.[s.id];
    let verdict;
    if (s.reach?.test) verdict = 'test-only';
    else if (!shot) verdict = 'not-shot';
    else if (!shot.reached) verdict = 'not-reached';
    else if (n.must.length) verdict = 'must';
    else if (n.small.length) verdict = 'small';
    else verdict = 'match';
    const key = { 'test-only': 'testOnly', 'not-reached': 'notReached', 'not-shot': 'notReached' }[verdict] ?? verdict;
    counts[key] += 1;
    states[s.id] = { verdict, must: n.must, small: n.small };
  }
  return { states, counts };
}

const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const inline = (t) => esc(t).replace(/`([^`]+)`/g, '<code>$1</code>');

/**
 * The comparison page: one row per state, three pictures (design, first round, this round) and the
 * reviewers' notes. Picture paths are relative to the page.
 * @param {{ title: string, round: number, beforeRound: number|null, map: object, summary: ReturnType<typeof summarise>, pictures: (id: string) => { design: string|null, before: string|null, now: string|null } }} o
 */
export function renderCompare(o) {
  const { counts } = o.summary;
  const label = { match: 'matches', small: 'small differences', must: 'to fix', 'test-only': 'unit tests only', 'not-reached': 'not reached', 'not-shot': 'not pictured' };
  const screens = [...new Set((o.map.states ?? []).map((s) => s.screen))];
  const fig = (src, cap, id) => (src
    ? `<figure class="shot"><figcaption>${cap}</figcaption><button type="button" class="zoom" data-src="${esc(src)}" data-cap="${esc(id)} · ${cap}"><img loading="lazy" src="${esc(src)}" alt="${esc(id)} ${cap}"></button></figure>`
    : `<figure class="shot"><figcaption>${cap}</figcaption><div class="empty">No picture</div></figure>`);
  const rows = (o.map.states ?? []).map((s) => {
    const v = o.summary.states[s.id];
    const p = o.pictures(s.id);
    const notes = [...v.must.map((t) => `<li class="m">${inline(t)}</li>`), ...v.small.map((t) => `<li class="s">${inline(t)}</li>`)].join('');
    const pill = v.verdict === 'must' ? `${v.must.length} to fix` : label[v.verdict];
    return `<article class="state" data-screen="${esc(s.screen)}" data-verdict="${v.verdict}" id="${esc(s.id)}">
  <header><span class="sid">${esc(s.id)}</span><h2>${esc(s.screen)} / ${esc(s.name)}</h2><span class="pill ${v.verdict}">${esc(pill)}</span></header>
  <div class="trio">${fig(p.design, 'Design', s.id)}${o.beforeRound ? fig(p.before, `Round ${o.beforeRound}`, s.id) : ''}${fig(p.now, `Round ${o.round}`, s.id)}</div>
  ${notes ? `<ul class="notes">${notes}</ul>` : ''}
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
.pill.must, .pill.not-reached { color:var(--must); background:var(--must-bg); } .pill.small { color:var(--small); background:var(--small-bg); } .pill.match { color:var(--ok); background:var(--ok-bg); }
.trio { display:grid; grid-template-columns:repeat(auto-fit, minmax(min(100%, 280px), 1fr)); gap:12px; }
.shot { margin:0; display:grid; gap:6px; align-content:start; }
.shot figcaption { font-size:.78rem; font-weight:500; color:var(--muted); letter-spacing:.03em; text-transform:uppercase; }
.zoom { all:unset; cursor:zoom-in; display:block; border:1px solid var(--line); border-radius:6px; overflow:hidden; background:#fff; max-height:560px; }
.zoom img { display:block; width:100%; height:auto; }
.empty { display:grid; place-items:center; min-height:120px; color:var(--muted); background:var(--none-bg); border-radius:6px; font-size:.85rem; }
.notes { margin:0; padding-left:1.2rem; display:grid; gap:4px; max-width:110ch; }
.notes li.m::marker { color:var(--must); } .notes li.s { color:var(--muted); }
.notes code { font:500 .85em var(--mono); }
.viewer { position:fixed; inset:0; z-index:10; background:rgba(8,10,14,.9); overflow:auto; padding:calc(56px + env(safe-area-inset-top,0px)) 16px 24px; }
.viewer img { display:block; margin:0 auto; max-width:min(100%,1200px); background:#fff; border-radius:4px; }
.vbar { position:fixed; top:0; left:0; right:0; display:flex; justify-content:space-between; align-items:center; gap:12px; padding:calc(10px + env(safe-area-inset-top,0px)) 16px 10px; background:rgba(8,10,14,.95); color:#fff; }
.vbar button { font:500 .85rem/1 var(--sans); color:#fff; background:transparent; border:1px solid #777; border-radius:999px; padding:7px 14px; cursor:pointer; }
</style>
<div class="wrap">
  <section>
    <h1>${esc(o.title)}</h1>
    <p class="lede">Each designed state: the design, ${o.beforeRound ? `round ${o.beforeRound}, ` : ''}and round ${o.round}, with the reviewers' notes. Only the page's own area is pictured. Click a picture to see it full size.</p>
    <ul class="tally"><li><b>${counts.match}</b>match</li><li><b>${counts.small}</b>small differences only</li><li><b>${counts.must}</b>to fix</li><li><b>${counts.notReached}</b>not reached</li><li><b>${counts.testOnly}</b>unit tests only</li></ul>
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
