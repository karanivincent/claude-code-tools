// Spike S4 (and the S6 dev-server baseline): shoot read-only Members/Calling states, save live text,
// compare traced design values with it, then plant 3 faults by rewriting API responses in the browser
// (no database writes) and check that the comparison catches them.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';

const WT = '/Users/vince/Projects/Telitask/telitask-development/.claude/worktrees/delivery-settings-page';
const BASE = process.env.BASE ?? 'http://localhost:3419';
const LABEL = process.env.LABEL ?? 'dev';
const OUT = new URL(`./s4-out-${LABEL}/`, import.meta.url).pathname;
await mkdir(OUT, { recursive: true });
const { pageExtract } = await import('/Users/vince/Documents/Projects/claude-code-tools/delivery-tools/lib/capture/page-extract.mjs');
const { chromium } = createRequire(`${WT}/apps/dashboard/package.json`)('@playwright/test');
const map = JSON.parse(await readFile(`${WT}/docs/delivery/settings-page/map.json`, 'utf8'));
const trace = JSON.parse(await readFile(new URL('./s2/trace.json', import.meta.url), 'utf8'));
const subs = JSON.parse(await readFile(new URL('./s3-generated.json', import.meta.url), 'utf8')).substitutions;

const STATES = ['SM-01', 'SM-05', 'SM-17', 'SM-21', 'SP-20'];
// Values the trace says come from a column; time values are compared by shape.
function expected(id) {
  return trace[id].filter((x) => x.kind === 'column').map((x) => {
    const want = subs[x.text] ?? x.text;
    if (x.time) return { text: x.text, shape: /expires \w{3} \d{1,2} \w{3}/i };
    return { text: x.text, want };
  });
}
function check(id, lines) {
  const hay = lines.join('\n');
  const miss = [];
  for (const e of expected(id)) {
    const ok = e.shape ? e.shape.test(hay) : lines.some((l) => l === e.want || l.includes(e.want));
    if (!ok) miss.push(e.want ?? e.text);
  }
  return miss;
}

const faults = {
  // F1: a member disappears; F2: a role changes; F3: calling hours shift.
  'SM-01': { url: '/api/dashboard/members', edit: (j) => { const a = j.members ?? j.data ?? j; if (Array.isArray(a)) a.splice(2, 1); return j; } },
  'SM-05': { url: '/api/dashboard/members', edit: (j) => { const a = j.members ?? j.data ?? j; if (Array.isArray(a)) for (const m of a) if (m.role === 'admin') m.role = 'member'; return j; } },
  'SP-20': { url: '/api/dashboard/calling', edit: (j) => { const h = j.hours ?? j.data?.hours ?? j.callingHours; if (h) h.startMinute = 540; return j; } },
};

const browser = await chromium.launch();
const results = [];
for (const plant of [false, true]) {
  for (const id of STATES) {
    if (plant && !faults[id]) continue;
    const s = map.states.find((x) => x.id === id);
    const r = s.reach;
    const ctxOpts = { viewport: { width: 1440, height: 900 }, storageState: `${WT}/.delivery/settings-page/sessions/shoot-localhost-${r.world}-${r.role}.json` };
    const ctx = await browser.newContext(ctxOpts);
    const page = await ctx.newPage();
    if (plant) {
      const f = faults[id];
      await page.route(`**${f.url}*`, async (route) => {
        const res = await route.fetch();
        let j; try { j = await res.json(); } catch { return route.fulfill({ response: res }); }
        await route.fulfill({ response: res, json: f.edit(j) });
      });
    }
    const t0 = Date.now();
    await page.goto(BASE + r.steps[0].goto, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(600);
    const ms = Date.now() - t0;
    const url = page.url();
    const { lines } = await page.evaluate(pageExtract, {});
    await writeFile(`${OUT}${id}${plant ? '.fault' : ''}.live.txt`, lines.join('\n'));
    const miss = check(id, lines);
    results.push({ id, plant, ms, signedIn: !/\/(login|auth)/.test(url), missing: miss });
    await ctx.close();
  }
}
await browser.close();
for (const r of results) console.log(`${r.plant ? 'FAULT' : 'clean'} ${r.id} ${r.ms}ms signedIn=${r.signedIn} missing=${JSON.stringify(r.missing)}`);
await writeFile(`${OUT}results.json`, JSON.stringify(results, null, 2));
