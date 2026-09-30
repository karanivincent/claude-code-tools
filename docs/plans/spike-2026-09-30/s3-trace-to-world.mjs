// Spike S3: can a command (no agent) turn a trace into world rows? Compare with the hand-written world.
import { readFile, writeFile } from 'node:fs/promises';

const WT = '/Users/vince/Projects/Telitask/telitask-development/.claude/worktrees/delivery-settings-page';
const trace = JSON.parse(await readFile(new URL('./s2/trace.json', import.meta.url), 'utf8'));
const hand = JSON.parse(await readFile(`${WT}/docs/delivery/settings-page/worlds/design.json`, 'utf8'));
const map = JSON.parse(await readFile(`${WT}/docs/delivery/settings-page/map.json`, 'utf8'));
const handUsers = map.worlds.find((w) => w.id === 'design').users;

// Value parsers: the part a command can do without judgment.
const enumOf = (t) => t.trim().toLowerCase();
const minutes = (t) => {
  const m = /^(\d{1,2}):(\d{2})\s*(am|pm)?$/i.exec(t.trim());
  if (!m) return null;
  let h = Number(m[1]) % 12; if ((m[3] ?? '').toLowerCase() === 'pm') h += 12; if (!m[3]) h = Number(m[1]);
  return h * 60 + Number(m[2]);
};
const safeEmail = (slug, role) => `delivery+st-${slug}-${role}@example.invalid`;

const gen = { users: [], rows: [], substitutions: {}, needsAgent: [] };
const e = trace['SM-01'];
// Group by sequence: a users.full_name starts a member; a lone invitations.email starts an invitation.
let cur = null;
for (const x of e) {
  if (x.kind !== 'column' && !(x.kind === 'computed' && x.time)) continue;
  const key = `${x.table}.${x.column}`;
  if (key === 'users.full_name') { cur = { kind: 'member', name: x.text }; gen._m ??= []; gen._m.push(cur); continue; }
  if (key === 'organization_invitations.email') { cur = { kind: 'inv', email: x.text }; gen._i ??= []; gen._i.push(cur); continue; }
  if (!cur) continue;
  if (key === 'users.email') cur.email = x.text;
  if (key === 'organization_members.role' && cur.kind === 'member') cur.role = enumOf(x.text);
  if (key === 'organization_invitations.role') cur.role = enumOf(x.text);
  if (x.time) cur.time = x.text;
}
// The header's signed-in user appears first without an email: drop names that repeat without an email.
const members = (gen._m ?? []).filter((m) => m.email);
const roleCount = {};
for (const m of members) {
  const n = (roleCount[m.role] = (roleCount[m.role] ?? 0) + 1);
  const r = n === 1 ? m.role : `${m.role}${n}`;
  const email = safeEmail('design', r);
  gen.substitutions[m.email] = email;
  gen.users.push({ role: r, email, name: m.name });
  gen.rows.push({ key: `m-${r}`, table: 'organization_members', values: { user_id: { $ref: `user:${r}` }, role: m.role } });
}
for (const i of gen._i ?? []) {
  const local = i.email.split('@')[0];
  const email = `${local}@example.invalid`;
  gen.substitutions[i.email] = email;
  const past = /expired/i.test(i.time ?? '');
  gen.rows.push({ key: `inv-${local}`, table: 'organization_invitations', values: { email, role: i.role, expires_at: { $rel: past ? 'now-2d' : 'now+5d' } } });
  if (!past) gen.needsAgent.push(`inv-${local}: design shows an absolute date ("${i.time}"); a relative date is used, so datacheck must compare its shape`);
}
const sp = trace['SP-20'];
const start = sp.find((x) => x.column === 'start_minute'); const end = sp.find((x) => x.column === 'end_minute');
gen.rows.push({ key: 'calling-hours', table: 'org_calling_hours', values: { start_minute: minutes(start.text), end_minute: minutes(end.text), days: null } });
gen.needsAgent.push('calling-hours.days: which days are on is drawn as toggles, not text; needs the DOM state (aria-pressed) or an agent');
gen.needsAgent.push('SP-20 "12 calls at once / agents use 4": trace names one column for two numbers; the page stores only one (no source for the total)');
delete gen._m; delete gen._i;

// Compare with the hand world.
const hRows = Object.fromEntries(hand.rows.map((r) => [r.key, r]));
const report = [];
for (const u of gen.users) {
  const h = handUsers.find((x) => x.role === u.role);
  report.push(`user ${u.role}: name ${h?.name === u.name ? 'same' : `DIFF (${h?.name} vs ${u.name})`}, email ${h?.email === u.email ? 'same' : `DIFF (${h?.email} vs ${u.email})`}`);
}
for (const r of gen.rows) {
  const h = hRows[r.key];
  if (!h) { report.push(`${r.key}: not in hand world`); continue; }
  const diffs = Object.entries(r.values).filter(([k, v]) => k !== 'user_id' && k !== 'expires_at' && JSON.stringify(h.values[k]) !== JSON.stringify(v)).map(([k, v]) => `${k}: hand ${JSON.stringify(h.values[k])} vs gen ${JSON.stringify(v)}`);
  report.push(`${r.key}: ${diffs.length ? 'DIFF ' + diffs.join('; ') : 'same'}${h.values.expires_at ? ` (expires hand ${JSON.stringify(h.values.expires_at)} gen ${JSON.stringify(r.values.expires_at)})` : ''}`);
}
await writeFile(new URL('./s3-generated.json', import.meta.url), JSON.stringify(gen, null, 2));
console.log(report.join('\n'));
console.log('needs an agent:\n- ' + gen.needsAgent.join('\n- '));
console.log('substitutions:', gen.substitutions);
